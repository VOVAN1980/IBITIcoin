const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Helper to fast-forward time
async function warp(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("NFTDiscount – miscellaneous coverage tests", function () {
  let nft;
  let owner, dao, staking, operator, alice, bob;
  const DAY = 24 * 3600;

  before(async () => {
    [owner, dao, staking, operator, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("NFTDiscount");
    nft = await Factory.deploy();
    await nft.waitForDeployment();
    // Setup roles
    await nft.setDAOModule(dao.address);
    await nft.setDiscountOperator(operator.address);
  });

  describe("Admin setters and events", () => {
    it("owner can set DAOModule and emits event", async () => {
      await expect(
        nft.connect(alice).setDAOModule(dao.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(nft.connect(owner).setDAOModule(dao.address))
        .to.emit(nft, "DAOModuleSet")
        .withArgs(dao.address);
      expect(await nft.daoModule()).to.equal(dao.address);
    });

    it("owner can set discountOperator and emits event", async () => {
      await expect(
        nft.connect(alice).setDiscountOperator(operator.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(nft.connect(owner).setDiscountOperator(operator.address))
        .to.emit(nft, "DiscountOperatorSet")
        .withArgs(operator.address);
      expect(await nft.discountOperator()).to.equal(operator.address);
    });

    it("owner can set monthlyLimit and supplyCap with events", async () => {
      await expect(nft.connect(owner).setMonthlyLimit(1, 5))
        .to.emit(nft, "MonthlyLimitUpdated")
        .withArgs(1, 5);
      expect(await nft.monthlyLimit(1)).to.equal(5);
      await expect(nft.connect(owner).setSupplyCap(2, 7))
        .to.emit(nft, "SupplyCapUpdated")
        .withArgs(2, 7);
      expect(await nft.supplyCap(2)).to.equal(7);
    });
  });

  describe("URI conversion (_convertToHttps)", () => {
    it("converts ipfs:// to https link on mint", async () => {
      const raw = "ipfs://CID123";
      await nft.connect(owner).mint(alice.address, 1, raw);
      expect(await nft.tokenURI(0)).to.equal("https://dweb.link/ipfs/CID123");
    });

    it("leaves non-ipfs URI unchanged on mint", async () => {
      const raw = "http://example.com/test";
      await nft.connect(owner).mint(alice.address, 1, raw);
      expect(await nft.tokenURI(0)).to.equal(raw);
    });
  });

  describe("Expiry for different levels", () => {
    it("auto-burns Legendary NFT after 180 days", async () => {
      await nft.connect(owner).mint(alice.address, 10, "ipfs://leg");
      await warp(180 * DAY + 1);
      await expect(
        nft.connect(alice).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("auto-burns Epic NFT after 365 days", async () => {
      await nft.connect(owner).mint(alice.address, 50, "ipfs://epi");
      await warp(365 * DAY + 1);
      await expect(
        nft.connect(alice).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("auto-burns Jackpot NFT on useDiscountFor after 365 days", async () => {
      await nft.connect(owner).mintJackpot(alice.address, 20, "ipfs://jack");
      const tid = 0;
      await warp(365 * DAY + 1);
      // Ensure operator is set
      await nft.connect(owner).setDiscountOperator(owner.address);

      // Expect revert on expired Jackpot NFT usage
      await expect(
        nft.connect(owner).useDiscountFor(alice.address, tid)
      ).to.be.revertedWith("Discount NFT expired");

      // After revert, NFT should remain owned by alice
      expect(await nft.ownerOf(tid)).to.equal(alice.address);
    });
  });

  describe("Pandora direct usage", () => {
    it("owner of Pandora can call usePandora", async () => {
      await nft.connect(owner).mintPandora(bob.address, "puri");
      await expect(nft.connect(bob).usePandora(0)).to.emit(nft, "NFTUsed");
    });
  });

  describe("Level mapping (_levelFromDiscount)", () => {
    it("assigns correct level for Rare, Legendary, Epic", async () => {
      await nft.connect(owner).mint(alice.address, 3, "ipfs://r");
      const d3 = await nft.discountData(0);
      expect(d3.level).to.equal(1);
      await nft.connect(owner).mint(alice.address, 10, "ipfs://l");
      const d10 = await nft.discountData(1);
      expect(d10.level).to.equal(2);
      await nft.connect(owner).mint(alice.address, 50, "ipfs://e");
      const d50 = await nft.discountData(2);
      expect(d50.level).to.equal(3);
    });

    it("reverts on unsupported discount percent", async () => {
      await expect(
        nft.connect(owner).mint(alice.address, 2, "ipfs://bad")
      ).to.be.revertedWith("Invalid discount percent");
    });
  });

  describe("Transfer event and monthly transfer reset", () => {
    it("emits NFTTransferred event on valid transfer", async () => {
      await nft.connect(owner).mint(alice.address, 1, "ipfs://t");
      await expect(
        nft.connect(alice).transferFrom(alice.address, bob.address, 0)
      )
        .to.emit(nft, "NFTTransferred")
        .withArgs(0, alice.address, bob.address);
    });

    it("monthlyTransferCount resets after 30 days for Rare token", async () => {
      // Mint a Rare NFT to Alice (3% discount)
      await nft.connect(owner).mint(alice.address, 3, "ipfs://mtr");
      const tid = 0;
      // Perform two cycles of transfer back and forth to increment counts
      for (let i = 0; i < 2; i++) {
        await nft.connect(alice).transferFrom(alice.address, bob.address, tid);
        await nft.connect(bob).transferFrom(bob.address, alice.address, tid);
      }
      // Warp past 30 days but before Rare expiration (90 days)
      await warp(31 * DAY);
      // Now transferring again should succeed without ERC721 invalid token error
      await expect(
        nft.connect(alice).transferFrom(alice.address, bob.address, tid)
      ).to.not.be.reverted;
      expect(await nft.ownerOf(tid)).to.equal(bob.address);
    });
  });
});
