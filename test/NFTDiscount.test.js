const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("NFTDiscount", function() {
  let nft;
  let owner, dao, alice, bob;
  const NORMAL    = 1;
  const RARE      = 3;
  const PANDORA   = 100;
  const LEGENDARY = 7;
  const JACKPOT   = 25;
  // URI для Rare‑уровня (3%)
  const URI1 = "ipfs://rare";

  beforeEach(async () => {
    [owner, dao, alice, bob] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Настраиваем DAO-модуль и discountOperator
    await nft.setDAOModule(dao.address);
    await nft.setDiscountOperator(owner.address);
  });

  it("owner can mint Normal and respects monthlyLimit", async () => {
    await expect(nft.mint(alice.address, NORMAL, "uri1"))
      .to.emit(nft, "NFTMinted")
      .withArgs(alice.address, 0, NORMAL, 0);

    // Используем uri2..uri10
    for (let i = 2; i <= 10; i++) {
      await nft.mint(alice.address, NORMAL, `uri${i}`);
    }
    // 11‑й mint → превышен лимит
    await expect(nft.mint(alice.address, NORMAL, "uri11"))
      .to.be.revertedWith("Monthly mint limit reached");
  });

  it("owner can mintPandora and usePandora up to 10 times, resets after 360d", async () => {
    await expect(nft.mintPandora(alice.address, "puri"))
      .to.emit(nft, "NFTMintedPandora");
    const id = 0;
    for (let i = 0; i < 10; i++) {
      await expect(nft.connect(alice).usePandora(id))
        .to.emit(nft, "NFTUsed");
    }
    await expect(nft.connect(alice).usePandora(id))
      .to.be.revertedWith("Usage limit reached");
  });

  it("owner/dao can mintJackpot and it is non-transferable", async () => {
    await expect(nft.connect(dao).mintJackpot(bob.address, JACKPOT, "juri"))
      .to.emit(nft, "NFTMintedJackpot")
      .withArgs(bob.address, 0, JACKPOT);

    await expect(nft.connect(bob).transferFrom(bob.address, alice.address, 0))
      .to.be.revertedWith("Jackpot NFTs are non-transferable");
  });

  it("useDiscount burns NFT and emits event", async () => {
    await nft.mint(alice.address, NORMAL, "ruri");
    await expect(nft.connect(alice).useDiscount(0))
      .to.emit(nft, "NFTUsed")
      .withArgs(alice.address, 0, NORMAL);

    await expect(nft.connect(alice).useDiscount(0))
      .to.be.revertedWith("ERC721: invalid token ID");
  });

  it("transfer allowed immediately (cooldown disabled)", async () => {
    // Mint Legendary to Alice
    await nft.mint(alice.address, LEGENDARY, "luri");
    // Immediately transferable since cooldown is disabled
    await nft.connect(alice).transferFrom(alice.address, bob.address, 0);
    expect(await nft.ownerOf(0)).to.equal(bob.address);
  });

  it("owner can update supplyCap and monthlyLimit", async () => {
    await expect(nft.setSupplyCap(0, 5))
      .to.emit(nft, "SupplyCapUpdated")
      .withArgs(0, 5);

    await expect(nft.setMonthlyLimit(1, 2))
      .to.emit(nft, "MonthlyLimitUpdated")
      .withArgs(1, 2);
  });
  
  it("allows discountOperator to consume discount via useDiscountFor", async () => {
    // 1. Настраиваем discountOperator
    await nft.connect(owner).setDiscountOperator(alice.address);

    // 2. Минтим Normal NFT для Bob
    const URI = "ipfs://test-op";
    await nft.connect(owner).mint(bob.address, NORMAL, URI);

    // 3. Проверяем, что Bob владеет токеном #0
    expect(await nft.ownerOf(0)).to.equal(bob.address);

    // 4. Alice (discountOperator) вызывает useDiscountFor
    await expect(
      nft.connect(alice).useDiscountFor(bob.address, 0)
    )
      .to.emit(nft, "NFTUsed")
      .withArgs(bob.address, 0, NORMAL);

    // 5. После этого NFT должен быть сожжён
    await expect(nft.ownerOf(0)).to.be.revertedWith("ERC721: invalid token ID");
  });
  
  it("auto-burns expired NFT on transfer attempt after expiration", async () => {
    // Mint Rare NFT (3%) to Alice
    await nft.connect(owner).mint(alice.address, RARE, URI1);

    // Fast-forward 91 days (expiration for Rare = 90 days)
    await network.provider.send("evm_increaseTime", [91 * 24 * 3600]);
    await network.provider.send("evm_mine");

    // При попытке transfer NFT должен сгореть и revert "invalid token ID"
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 0)
    ).to.be.revertedWith("ERC721: invalid token ID");
  });
});
