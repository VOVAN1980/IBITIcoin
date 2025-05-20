const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager — branch coverage", function () {
  let feeManager, token, owner;
  const MAX_TIERS = 10;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // 1) Мок ERC20 для конструктора FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "Mock Token",
      "MTK",
      owner.address,
      ethers.parseUnits("1000", 18)
    );
    await token.waitForDeployment();

    // 2) Деплой FeeManager с адресом вышедшего ERC20Mock
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();
  });

  describe("setVolatilityTiers", function () {
    it("rejects too many tiers", async function () {
      const tiers = [];
      for (let i = 0; i < MAX_TIERS + 1; i++) {
        tiers.push({
          volumeThreshold: ethers.parseUnits((i + 1).toString(), 18),
          volatilityValue: 100 + i
        });
      }
      await expect(feeManager.setVolatilityTiers(tiers))
        .to.be.revertedWith("Too many tiers");
    });

    it("rejects unsorted tiers", async function () {
      const tiers = [
        { volumeThreshold: ethers.parseUnits("1000", 18), volatilityValue: 120 },
        { volumeThreshold: ethers.parseUnits("100", 18),  volatilityValue: 150 }
      ];
      await expect(feeManager.setVolatilityTiers(tiers))
        .to.be.revertedWith("Volatility tiers must be sorted");
    });

    it("accepts sorted tiers and stores them", async function () {
      const tiers = [
        { volumeThreshold: ethers.parseUnits("500", 18),  volatilityValue: 110 },
        { volumeThreshold: ethers.parseUnits("1000", 18), volatilityValue: 130 }
      ];
      await expect(feeManager.setVolatilityTiers(tiers))
        .to.emit(feeManager, "VolatilityTiersUpdated");

      const tier0 = await feeManager.volatilityTiers(0);
      expect(tier0.volumeThreshold).to.equal(tiers[0].volumeThreshold);
      expect(tier0.volatilityValue).to.equal(tiers[0].volatilityValue);

      const tier1 = await feeManager.volatilityTiers(1);
      expect(tier1.volumeThreshold).to.equal(tiers[1].volumeThreshold);
      expect(tier1.volatilityValue).to.equal(tiers[1].volatilityValue);
    });
  });

  describe("auditParameters — legacy logic (no tiers)", function () {
    it("uses highVolatilityValue when vol ≥ highThreshold", async function () {
      // по умолчанию highVolumeThreshold = 0 → vol = 0 ≥ 0
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(await feeManager.highVolatilityValue());
      expect(await feeManager.volatilityCoefficient())
        .to.equal(await feeManager.highVolatilityValue());
    });

    it("uses lowVolatilityValue when vol ≤ lowThreshold", async function () {
      // выставляем lowThreshold = 50, lowValue = 25
      await feeManager.setVolatilityParams(
        ethers.parseUnits("100", 18), // highThreshold
        ethers.parseUnits("50", 18),  // lowThreshold
        ethers.parseUnits("75", 18),  // highValue
        ethers.parseUnits("25", 18),  // lowValue
        ethers.parseUnits("50", 18)   // defaultValue
      );
      // vol = 0 ≤ lowThreshold
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(ethers.parseUnits("25", 18));
      expect(await feeManager.volatilityCoefficient())
        .to.equal(ethers.parseUnits("25", 18));
    });

    it("uses defaultVolatilityCoefficient when low < vol < high", async function () {
      // thresholds: low=10, high=100, default=88
      await feeManager.setVolatilityParams(
        ethers.parseUnits("100", 18), // highThreshold
        ethers.parseUnits("10", 18),  // lowThreshold
        ethers.parseUnits("150", 18), // highValue
        ethers.parseUnits("25", 18),  // lowValue
        ethers.parseUnits("88", 18)   // defaultValue
      );

      // переназначаем tokenContract на owner, чтобы updateActivity не revert’ил
      await feeManager.setTokenContract(owner.address);

      // эмулируем активность объёмом 50 (10 < 50 < 100)
      await feeManager.updateActivity(
        owner.address,
        ethers.parseUnits("50", 18),
        false
      );

      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(ethers.parseUnits("88", 18));
      expect(await feeManager.volatilityCoefficient())
        .to.equal(ethers.parseUnits("88", 18));
    });
  });

  describe("auditParameters — tier logic (with tiers)", function () {
    it("falls back to default when no tier matched", async function () {
      const tiers = [
        { volumeThreshold: ethers.parseUnits("1000", 18), volatilityValue: 200 }
      ];
      await feeManager.setVolatilityTiers(tiers);
      // vol = 0 → ни один threshold не сработал → default = 0
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(0);
      expect(await feeManager.volatilityCoefficient()).to.equal(0);
    });
  });
});
