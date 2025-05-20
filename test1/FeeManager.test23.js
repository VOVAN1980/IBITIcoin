const { expect } = require("chai");
const { ethers } = require("hardhat");

// FeeManager volatility tiers and auditParameters tests
// Uses ERC20Mock to provide valid tokenContract for FeeManager

describe("FeeManager – volatility tiers & auditParameters", function () {
  let owner, user;
  let token, feeManager, feeHelper;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy ERC20Mock for a valid tokenContract address
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "MOCK", "MCK", owner.address, ethers.parseUnits("1000000", 18)
    );
    await token.waitForDeployment();

    // Deploy FeeManager with ERC20Mock address
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();

    // Deploy helper to call updateActivity
    const FeeHelper = await ethers.getContractFactory("FeeHelper");
    feeHelper = await FeeHelper.deploy(feeManager.target);
    await feeHelper.waitForDeployment();

    // Now point FeeManager.tokenContract to FeeHelper
    await feeManager.setTokenContract(feeHelper.target);
  });

  it("reverts if you pass > MAX_VOLATILITY_TIERS to setVolatilityTiers", async () => {
    // Get max tiers and convert to JS number
    const maxTiersBN = await feeManager.MAX_VOLATILITY_TIERS();
    const maxTiers = Number(maxTiersBN);
    const tiers = Array(maxTiers + 1).fill({ volumeThreshold: 1, volatilityValue: 120 });
    await expect(
      feeManager.setVolatilityTiers(tiers)
    ).to.be.revertedWith("Too many tiers");
  });

  it("reverts if you pass unsorted thresholds to setVolatilityTiers", async () => {
    const bad = [
      { volumeThreshold: 100, volatilityValue: 120 },
      { volumeThreshold: 50,  volatilityValue: 110 }
    ];
    await expect(
      feeManager.setVolatilityTiers(bad)
    ).to.be.revertedWith("Volatility tiers must be sorted");
  });

  it("accepts sorted tiers and emits event and sets storage", async () => {
    const good = [
      { volumeThreshold: 50,  volatilityValue: 110 },
      { volumeThreshold: 100, volatilityValue: 150 }
    ];
    await expect(feeManager.setVolatilityTiers(good))
      .to.emit(feeManager, "VolatilityTiersUpdated");

    // Verify storage for each tier
    for (let i = 0; i < good.length; i++) {
      const tier = await feeManager.volatilityTiers(i);
      expect(tier.volumeThreshold).to.equal(good[i].volumeThreshold);
      expect(tier.volatilityValue).to.equal(good[i].volatilityValue);
    }
  });

  describe("auditParameters legacy logic (no tiers)", () => {
    beforeEach(async () => {
      await feeManager.setVolatilityParams(
        /*highVolThreshold*/ 200,
        /*lowVolThreshold */ 50,
        /*highVolValue*/     200,
        /*lowVolValue*/       25,
        /*defaultCoef*/       75
      );
    });

    it("volatilityCoefficient = lowVolValue when totalVolumePeriod = 0", async () => {
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(25);
      expect(await feeManager.volatilityCoefficient()).to.equal(25);
    });

    it("volatilityCoefficient = defaultCoef when volume between thresholds", async () => {
      await feeHelper.doActivity(user.address, 100);
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(75);
      expect(await feeManager.volatilityCoefficient()).to.equal(75);
    });

    it("volatilityCoefficient = highVolValue when volume ≥ high threshold", async () => {
      await feeHelper.doActivity(user.address, 300);
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(200);
      expect(await feeManager.volatilityCoefficient()).to.equal(200);
    });
  });

  describe("auditParameters tiered logic", () => {
    beforeEach(async () => {
      const tiers = [
        { volumeThreshold:  100, volatilityValue: 120 },
        { volumeThreshold: 1000, volatilityValue: 150 }
      ];
      await feeManager.setVolatilityTiers(tiers);
      await feeManager.setVolatilityParams(0, 0, 0, 0, 80);
    });

    it("uses defaultCoef when volume < first tier", async () => {
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(80);
      expect(await feeManager.volatilityCoefficient()).to.equal(80);
    });

    it("uses second tier value when volume ≥ second threshold", async () => {
      await feeHelper.doActivity(user.address, 2000);
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, "VolatilityCoefficientUpdated")
        .withArgs(150);
      expect(await feeManager.volatilityCoefficient()).to.equal(150);
    });
  });
});
