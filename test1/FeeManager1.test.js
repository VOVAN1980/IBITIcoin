// test/FeeManager1.test.js
const { expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;
const { parseUnits } = require("ethers");

describe("FeeManager", function() {
  let feeManager, owner, user, tokenMock;
  const ONE_TOKEN = parseUnits("1000", 8);
  const MIN_FEE = 10n;
  const MAX_FEE = 5000n;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", owner);
    tokenMock = await ERC20Mock.deploy(
      "MockToken",
      "MTK",
      owner.address,
      parseUnits("1000000", 8)
    );
    await tokenMock.waitForDeployment();

    const FM = await ethers.getContractFactory("FeeManager", owner);
    feeManager = await FM.deploy(tokenMock.target);
    await feeManager.waitForDeployment();

    await feeManager.connect(owner).setTokenContract(owner.address);
    await feeManager.connect(owner).setMinFee(Number(MIN_FEE));
    await feeManager.connect(owner).setMaxFee(Number(MAX_FEE));
  });

  describe("calculateFee — покупки и базовая логика", function() {
    it("clamps ONE_TOKEN * baseBuyFee / 100 ниже maxFee и выше minFee", async () => {
      // baseBuyFee = 0 → rawFee = 0 → clamp to minFee
      const fee = await feeManager.calculateFee(
        user.address,
        ONE_TOKEN,
        true,  // buy
        false,
        false,
        false,
        0,
        0
      );
      expect(fee).to.equal(MIN_FEE);
    });
  });

  describe("calculateFee — продажи и корректировки", function() {
    it("clamps при staking discount (-1%)", async () => {
      const fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, true, false, false, 0, 0
      );
      expect(fee).to.equal(MAX_FEE);
    });

    it("clamps при VIP-скидке и whale-наценке", async () => {
      const fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, true, true, 0, 0
      );
      expect(fee).to.equal(MAX_FEE);
    });

    it("clamps при длительном холдинге (>60d, 30<d≤60, ≤30)", async () => {
      // >60
      let fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false,
        61 * 24 * 3600, 0
      );
      expect(fee).to.equal(MAX_FEE);
      // 30<d≤60
      fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false,
        45 * 24 * 3600, 0
      );
      expect(fee).to.equal(MAX_FEE);
      // ≤30
      fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false,
        30 * 24 * 3600, 0
      );
      expect(fee).to.equal(MAX_FEE);
    });

    it("clamps при NFT-скидке мультипликативно", async () => {
      const fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false, 0, 50
      );
      expect(fee).to.equal(MAX_FEE);
    });

    it("clamps to minFee при nftDiscount ≥ 100", async () => {
      const fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false, 0, 100
      );
      expect(fee).to.equal(MIN_FEE);
    });
  });

  describe("calculateFee — clamp to minFee и maxFee", function() {
    it("clamps ниже minFee", async () => {
      const fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false, 0, 100
      );
      expect(fee).to.equal(MIN_FEE);
    });

    it("clamps выше maxFee", async () => {
      const fee = await feeManager.calculateFee(
        user.address, ONE_TOKEN,
        false, false, false, false, 0, 0
      );
      expect(fee).to.equal(MAX_FEE);
    });
  });

  describe("auditParameters — старая логика", function() {
    beforeEach(async () => {
      await feeManager.connect(owner).setVolatilityParams(
        1000, 100, 150, 50, 100
      );
    });

    it("highVolume → highVolatilityValue", async () => {
      await feeManager.connect(owner).updateActivity(user.address, 2000, false);
      await feeManager.connect(owner).auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(150n);
    });

    it("lowVolume → lowVolatilityValue", async () => {
      await feeManager.connect(owner).updateActivity(user.address, 50, false);
      await feeManager.connect(owner).auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(50n);
    });

    it("middleVolume → defaultVolatilityCoefficient", async () => {
      await feeManager.connect(owner).updateActivity(user.address, 500, false);
      await feeManager.connect(owner).auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(100n);
    });
  });

  describe("auditParameters — новая логика с тирами", function() {
    beforeEach(async () => {
      // ethers@6: передаём массив кортежей [threshold, value]
      await feeManager.connect(owner).setVolatilityTiers([
        [100, 110],
        [1000, 120]
      ]);
    });

    it("volume < firstThreshold → default", async () => {
      await feeManager.connect(owner).updateActivity(user.address, 50, false);
      await feeManager.connect(owner).auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(
        await feeManager.defaultVolatilityCoefficient()
      );
    });

    it("volume between tiers → first tier", async () => {
      await feeManager.connect(owner).updateActivity(user.address, 150, false);
      await feeManager.connect(owner).auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(110n);
    });

    it("volume ≥ highestThreshold → highest tier", async () => {
      await feeManager.connect(owner).updateActivity(user.address, 2000, false);
      await feeManager.connect(owner).auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(120n);
    });
  });

  describe("updateActivity — событие ActivityUpdated", function() {
    it("эмитит правильные параметры при накоплении", async () => {
      const tx1 = await feeManager.connect(owner).updateActivity(user.address, 100, true);
      const r1 = await tx1.wait();
      // Читаем событие через queryFilter
      const logs1 = await feeManager.queryFilter(
        feeManager.filters.ActivityUpdated(user.address),
        r1.blockNumber, r1.blockNumber
      );
      expect(logs1.length).to.equal(1);
      const args1 = logs1[0].args;
      expect(args1.user).to.equal(user.address);
      expect(args1.txCount).to.equal(1n);
      expect(args1.volume).to.equal(100n);

      const tx2 = await feeManager.connect(owner).updateActivity(user.address, 50, true);
      const r2 = await tx2.wait();
      const logs2 = await feeManager.queryFilter(
        feeManager.filters.ActivityUpdated(user.address),
        r2.blockNumber, r2.blockNumber
      );
      expect(logs2.length).to.equal(1);
      const args2 = logs2[0].args;
      expect(args2.txCount).to.equal(2n);
      expect(args2.volume).to.equal(150n);
    });

    it("сбрасывает счётчики после timeDecay", async () => {
      const tx0 = await feeManager.connect(owner).updateActivity(user.address, 100, false);
      const r0 = await tx0.wait();
      const decay = await feeManager.timeDecay();
      await ethers.provider.send("evm_increaseTime", [Number(decay) + 1]);
      await ethers.provider.send("evm_mine");
      const tx1 = await feeManager.connect(owner).updateActivity(user.address, 200, true);
      const r1 = await tx1.wait();
      const logs = await feeManager.queryFilter(
        feeManager.filters.ActivityUpdated(user.address),
        r1.blockNumber, r1.blockNumber
      );
      expect(logs.length).to.equal(1);
      const args = logs[0].args;
      expect(args.txCount).to.equal(1n);
      expect(args.volume).to.equal(200n);
    });
  });
});
