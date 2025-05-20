const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount Comprehensive Tests", function () {
  let nft;
  let owner, daoModule, stakingModule, other, signers;
  let winners, losers;

  beforeEach(async () => {
    signers = await ethers.getSigners();
    [owner, daoModule, stakingModule, other] = signers;

    // для простоты первые 2 – winners, следующие 2 – losers
    winners = [signers[4], signers[5]];
    losers  = [signers[6], signers[7]];

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    // Настройка DAO-модуля и StakingModule
    await nft.connect(owner).setDAOModule(daoModule.address);
    await nft.connect(owner).setStakingModule(stakingModule.address);
  });

  it("defaults: yesRewardPercent/count = 3/2, noRewardPercent/count = 1/2", async () => {
    expect(await nft.yesRewardPercent()).to.equal(3);
    expect(await nft.yesRewardCount()).to.equal(2);
    expect(await nft.noRewardPercent()).to.equal(1);
    expect(await nft.noRewardCount()).to.equal(2);
  });

  describe("setYesRewardParams & setNoRewardParams", () => {
    it("owner can set valid params", async () => {
      await nft.connect(owner).setYesRewardParams(5, 3);
      expect(await nft.yesRewardPercent()).to.equal(5);
      expect(await nft.yesRewardCount()).to.equal(3);

      await nft.connect(owner).setNoRewardParams(10, 1);
      expect(await nft.noRewardPercent()).to.equal(10);
      expect(await nft.noRewardCount()).to.equal(1);
    });

    it("non-owner cannot set params", async () => {
      await expect(
        nft.connect(other).setYesRewardParams(10, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        nft.connect(other).setNoRewardParams(10, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts on invalid pct/count", async () => {
      await expect(
        nft.connect(owner).setYesRewardParams(101, 1)
      ).to.be.revertedWith("pct>100");
      await expect(
        nft.connect(owner).setYesRewardParams(5, 0)
      ).to.be.revertedWith("count==0");

      await expect(
        nft.connect(owner).setNoRewardParams(200, 1)
      ).to.be.revertedWith("pct>100");
      await expect(
        nft.connect(owner).setNoRewardParams(10, 0)
      ).to.be.revertedWith("count==0");
    });
  });

  describe("awardVotingRewards behavior", () => {
    const BASE = "ipfs://base/";

    it("mints correct number & percent with defaults", async () => {
      const wAddrs = winners.map(w => w.address);
      const lAddrs = losers.map(l => l.address);

      expect(await nft.nextTokenId()).to.equal(0);
      await nft.connect(daoModule).awardVotingRewards(wAddrs, lAddrs, BASE);
      expect(await nft.nextTokenId()).to.equal(8); // 2*2 + 2*2

      // проверяем один победитель
      expect(await nft.ownerOf(0)).to.equal(wAddrs[0]);
      expect((await nft.discountData(0)).discountPercent).to.equal(3);
      // проверяем один проигравший
      expect(await nft.ownerOf(4)).to.equal(lAddrs[0]);
      expect((await nft.discountData(4)).discountPercent).to.equal(1);
    });

    it("respects updated params after setters", async () => {
      await nft.connect(owner).setYesRewardParams(10, 1);
      await nft.connect(owner).setNoRewardParams(2, 1);

      const wAddrs = [winners[0].address];
      const lAddrs = [losers[0].address];

      await nft.connect(daoModule).awardVotingRewards(wAddrs, lAddrs, BASE);
      expect(await nft.nextTokenId()).to.equal(2);

      expect((await nft.discountData(0)).discountPercent).to.equal(10);
      expect((await nft.discountData(1)).discountPercent).to.equal(2);
    });

    it("cannot award rewards twice within 30 days", async () => {
      const wAddrs = [winners[0].address];
      const lAddrs = [losers[0].address];

      await nft.connect(daoModule).awardVotingRewards(wAddrs, lAddrs, BASE);
      await expect(
        nft.connect(daoModule).awardVotingRewards(wAddrs, lAddrs, BASE)
      ).to.be.revertedWith("Voting rewards already awarded this month");
    });

    it("non-authorized cannot call awardVotingRewards", async () => {
      const wAddrs = [winners[0].address];
      const lAddrs = [losers[0].address];

      await expect(
        nft.connect(other).awardVotingRewards(wAddrs, lAddrs, BASE)
      ).to.be.revertedWith("Not authorized to award rewards");
    });
  });

  describe("when paused", () => {
    beforeEach(async () => {
      await nft.connect(owner).pause();
    });

    it("setters still work when paused", async () => {
      await nft.connect(owner).setYesRewardParams(7, 4);
      expect(await nft.yesRewardPercent()).to.equal(7);
      expect(await nft.yesRewardCount()).to.equal(4);

      await nft.connect(owner).setNoRewardParams(8, 3);
      expect(await nft.noRewardPercent()).to.equal(8);
      expect(await nft.noRewardCount()).to.equal(3);
    });

    it("awardVotingRewards reverts when paused", async () => {
      const w = [winners[0].address];
      const l = [losers[0].address];
      await expect(
        nft.connect(daoModule).awardVotingRewards(w, l, "ipfs://")
      ).to.be.revertedWith("Contract is paused");
    });

    afterEach(async () => {
      await nft.connect(owner).unpause();
    });
  });

  describe("events", () => {
    it("emits VotingRewardsIssued on awardVotingRewards", async () => {
      const w = [winners[0].address];
      const l = [losers[0].address];
      await expect(
        nft.connect(daoModule).awardVotingRewards(w, l, "ipfs://x/")
      ).to.emit(nft, "VotingRewardsIssued");
    });
  });

  describe("batch issuance & setTotalParticipants", () => {
    const BASE = "ipfs://batch/";
    let fullWinners, fullLosers;

    beforeEach(async () => {
      fullWinners = [signers[4], signers[5], signers[6]];
      fullLosers  = [signers[7], signers[8], signers[9]];
      await nft.connect(owner).setTotalParticipants(fullWinners.length, fullLosers.length);
    });

    it("setTotalParticipants: onlyOwner & invalid args", async () => {
      await expect(
        nft.connect(other).setTotalParticipants(1, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        nft.connect(owner).setTotalParticipants(0, 3)
      ).to.be.revertedWith("Winners>0");
      await expect(
        nft.connect(owner).setTotalParticipants(3, 0)
      ).to.be.revertedWith("Losers>0");
    });

    it("awardWinnersBatch mints correct tokens", async () => {
    const winnersSubset = fullWinners.slice(0, 2).map(a => a.address);
    // до вызова
    expect(await nft.nextTokenId()).to.equal(0);

    await nft.connect(daoModule).awardWinnersBatch(winnersSubset, BASE);
    const total = await nft.nextTokenId();
    // 2 winners * yesRewardCount(2) = 4
    expect(total).to.equal( winnersSubset.length * 2 );

    // каждый из заминченных токенов принадлежит одному из winnersSubset
    for (let tokenId = 0; tokenId < total; tokenId++) {
      const ownerAddr = await nft.ownerOf(tokenId);
      expect(winnersSubset).to.include(ownerAddr);
      expect((await nft.discountData(tokenId)).discountPercent).to.equal(3);
    }
  });

    it("awardLosersBatch mints correct tokens", async () => {
    const losersSubset = fullLosers.slice(1, 3).map(a => a.address);
    expect(await nft.nextTokenId()).to.equal(0);

    await nft.connect(daoModule).awardLosersBatch(losersSubset, BASE);
    const total = await nft.nextTokenId();
    // 2 losers * noRewardCount(2) = 4
    expect(total).to.equal( losersSubset.length * 2 );

    for (let tokenId = 0; tokenId < total; tokenId++) {
      const ownerAddr = await nft.ownerOf(tokenId);
      expect(losersSubset).to.include(ownerAddr);
      expect((await nft.discountData(tokenId)).discountPercent).to.equal(1);
    }
  });

    it("batch methods enforce authorization", async () => {
      const subset = fullWinners.slice(0, 1).map(a => a.address);
      await expect(
        nft.connect(other).awardWinnersBatch(subset, BASE)
      ).to.be.revertedWith("Not authorized");
      await expect(
        nft.connect(other).awardLosersBatch(subset, BASE)
      ).to.be.revertedWith("Not authorized");
    });

    it("batch methods respect whenNotPaused", async () => {
      const subsetW = fullWinners.slice(0, 1).map(a => a.address);
      const subsetL = fullLosers.slice(0, 1).map(a => a.address);
      await nft.connect(owner).pause();
      await expect(
        nft.connect(daoModule).awardWinnersBatch(subsetW, BASE)
      ).to.be.revertedWith("Contract is paused");
      await expect(
        nft.connect(daoModule).awardLosersBatch(subsetL, BASE)
      ).to.be.revertedWith("Contract is paused");
      await nft.connect(owner).unpause();
    });
  });
});
