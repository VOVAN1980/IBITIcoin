const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount: setters & awardVotingRewards", function () {
  let nft;
  let owner, daoModule, stakingModule, other, signers;
  let winners, losers;

  beforeEach(async () => {
    signers = await ethers.getSigners();
    [owner, daoModule, stakingModule, other] = signers;

    // Определяем пару победителей и пару проигравших из списка signers
    winners = [signers[4], signers[5]];
    losers  = [signers[6], signers[7]];

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    // сразу готов к взаимодействию

    // Настраиваем DAO-модуль и StakingModule
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

      // 2 winners * 2 + 2 losers * 2 = 8
      expect(await nft.nextTokenId()).to.equal(8);

      // Проверка первого выигрыша
      expect(await nft.ownerOf(0)).to.equal(wAddrs[0]);
      expect((await nft.discountData(0)).discountPercent).to.equal(3);

      // Проверка первого поражения
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

  // --- Новые тесты для pause и события ---
  describe("when paused", () => {
  beforeEach(async () => {
    await nft.connect(owner).pause();
  });

  it("setters still work when paused", async () => {
    // Сеттеры не защищены whenNotPaused — они должны пройти
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
});
