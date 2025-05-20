// test/NFTDiscount.test1.js
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("NFTDiscount", function() {
  let nft, owner, alice, bob;
  const URI1 = "ipfs://cid1";
  const URI2 = "ipfs://cid2";
  const BASE_URI = "ipfs://base";

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("NFTDiscount", owner);
    nft = await NFT.deploy();
    await nft.waitForDeployment();
  });

  it("mints Normal NFT and tracks data", async () => {
    await expect(nft.connect(owner).mint(alice.address, 1, URI1))
      .to.emit(nft, "NFTMinted")
      .withArgs(alice.address, 0, 1, 0);

    expect(await nft.ownerOf(0)).to.equal(alice.address);
    const data = await nft.discountData(0);
    expect(data.discountPercent).to.equal(1);
    expect(data.level).to.equal(0); // NFTLevel.Normal
  });

  it("prevents duplicate URI", async () => {
    // поднимаем monthlyLimit, чтобы не мешал
    await nft.connect(owner).setMonthlyLimit(0, 2000);

    // первый mint проходит
    await nft.connect(owner).mint(alice.address, 1, URI1);
    // повторный тот же URI — откат
    await expect(
      nft.connect(owner).mint(bob.address, 1, URI1)
    ).to.be.revertedWith("URI already used");
  });

  it("burns NFT on useDiscount and emits NFTUsed", async () => {
    await nft.connect(owner).mint(alice.address, 1, URI1);
    await expect(nft.connect(alice).useDiscount(0))
      .to.emit(nft, "NFTUsed")
      .withArgs(alice.address, 0, 1);

    await expect(nft.ownerOf(0)).to.be.revertedWith("ERC721: invalid token ID");
  });

  it("reverts on expired NFT when useDiscount is called after expiration", async () => {
    await nft.connect(owner).mint(alice.address, 3, URI1);
    // пролетаем 91 день (для Rare = 90)
    await network.provider.send("evm_increaseTime", [91 * 24 * 3600]);
    await network.provider.send("evm_mine");

    // теперь ожидаем откат с правильным сообщением об истечении
    await expect(
      nft.connect(alice).useDiscount(0)
    ).to.be.revertedWith("Discount NFT expired");
  });

  it("mints and uses Pandora NFT up to 10 times, resets after 360 days", async () => {
    await expect(nft.connect(owner).mintPandora(alice.address, URI1))
      .to.emit(nft, "NFTMintedPandora");
    for (let i = 0; i < 10; i++) {
      await expect(nft.connect(alice).usePandora(0))
        .to.emit(nft, "NFTUsed")
        .withArgs(alice.address, 0, 100);
    }
    await expect(nft.connect(alice).usePandora(0))
      .to.be.revertedWith("Usage limit reached");

    // пролетаем 361 день — счётчик сбрасывается
    await network.provider.send("evm_increaseTime", [361 * 24 * 3600]);
    await network.provider.send("evm_mine");
    await expect(nft.connect(alice).usePandora(0))
      .to.emit(nft, "NFTUsed")
      .withArgs(alice.address, 0, 100);
  });

  it("mints Jackpot NFTs and prohibits transfer", async () => {
    await expect(nft.connect(owner).mintJackpot(bob.address, 5, URI1))
      .to.emit(nft, "NFTMintedJackpot")
      .withArgs(bob.address, 0, 5);
    await expect(
      nft.connect(bob).transferFrom(bob.address, alice.address, 0)
    ).to.be.revertedWith("Jackpot NFTs are non-transferable");
  });

  it("updateNFT burns old and mints new preserving purchaseTime and emits raw URI", async () => {
    // mint Legendary
    await nft.connect(owner).mint(alice.address, 10, URI1);
    const before = await nft.discountData(0);

    // пролетаем 10 дней
    await network.provider.send("evm_increaseTime", [10 * 24 * 3600]);
    await network.provider.send("evm_mine");

    // ожидаем событие с "сырым" newTokenURI (ipfs://cid2)
    await expect(nft.connect(owner).updateNFT(0, URI2))
      .to.emit(nft, "NFTUpdated")
      .withArgs(0, 1, URI2);

    // но tokenURI вернёт уже https://dweb.link/ipfs/cid2
    expect(await nft.tokenURI(1)).to.equal("https://dweb.link/ipfs/" + URI2.slice(7));

    const after = await nft.discountData(1);
    expect(after.purchaseTime).to.equal(before.purchaseTime);
    expect(after.discountPercent).to.equal(before.discountPercent);
  });

  it("awardVotingRewards mints correct jackpot NFTs and enforces 30d & unique URIs", async () => {
    const winners = [alice.address];
    const losers = [bob.address];

    const tx1 = await nft.connect(owner).awardVotingRewards(winners, losers, BASE_URI);
    const r1 = await tx1.wait();
    const { timestamp: t1 } = await ethers.provider.getBlock(r1.blockNumber);
    await expect(tx1)
      .to.emit(nft, "VotingRewardsIssued")
      .withArgs(t1, winners, losers);
    expect(await nft.balanceOf(alice.address)).to.equal(2);
    expect(await nft.balanceOf(bob.address)).to.equal(2);

    // повторная попытка до +30 дней — откат
    await expect(
      nft.connect(owner).awardVotingRewards(winners, losers, BASE_URI)
    ).to.be.revertedWith("Voting rewards already awarded this month");

    // +31 день — снова можно
    await network.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await network.provider.send("evm_mine");
    const NEW_BASE = BASE_URI + "/v2/";
    const tx2 = await nft.connect(owner).awardVotingRewards(winners, losers, NEW_BASE);
    const r2 = await tx2.wait();
    const { timestamp: t2 } = await ethers.provider.getBlock(r2.blockNumber);
    await expect(tx2)
      .to.emit(nft, "VotingRewardsIssued")
      .withArgs(t2, winners, losers);
    expect(await nft.balanceOf(alice.address)).to.equal(4);
    expect(await nft.balanceOf(bob.address)).to.equal(4);
  });
});
