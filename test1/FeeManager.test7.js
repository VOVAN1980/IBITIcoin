// test/FeeManager.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager", function () {
  let feeManager;
  let tokenContract;
  let owner, other;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // 1) Разворачиваем мок ERC20 для tokenContract
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    tokenContract = await ERC20Mock.deploy(
      "MockToken",
      "MTK",
      owner.address,
      ethers.parseUnits("1000", 18)
    );
    await tokenContract.waitForDeployment();

    // 2) Разворачиваем FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(await tokenContract.getAddress());
    await feeManager.waitForDeployment();
  });

  describe("setVolatilityTiers", function () {
    it("reverts when too many tiers", async function () {
      // MAX_VOLATILITY_TIERS = 10 :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}
      const tooMany = [];
      for (let i = 0; i < 11; i++) {
        tooMany.push({
          volumeThreshold: ethers.parseUnits("1", 18),
          volatilityValue: 100
        });
      }
      await expect(
        feeManager.setVolatilityTiers(tooMany)
      ).to.be.revertedWith("Too many tiers");
    });

    it("stores tiers correctly and emits event", async function () {
      const tiers = [
        { volumeThreshold: ethers.parseUnits("100", 18), volatilityValue: 120 },
        { volumeThreshold: ethers.parseUnits("200", 18), volatilityValue: 150 },
      ];
      await expect(feeManager.setVolatilityTiers(tiers))
        .to.emit(feeManager, "VolatilityTiersUpdated");  // :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}

      const t0 = await feeManager.volatilityTiers(0);
      expect(t0.volumeThreshold).to.equal(tiers[0].volumeThreshold);
      expect(t0.volatilityValue).to.equal(tiers[0].volatilityValue);

      const t1 = await feeManager.volatilityTiers(1);
      expect(t1.volumeThreshold).to.equal(tiers[1].volumeThreshold);
      expect(t1.volatilityValue).to.equal(tiers[1].volatilityValue);
    });
  });

  describe("setVolatilityParams (legacy)", function () {
    it("updates and emits LegacyVolatilityParamsUpdated", async function () {
      await expect(
        feeManager.setVolatilityParams(1000, 500, 150, 80, 100)
      )
        .to.emit(feeManager, "LegacyVolatilityParamsUpdated")  // :contentReference[oaicite:4]{index=4}&#8203;:contentReference[oaicite:5]{index=5}
        .withArgs(1000, 500, 150, 80, 100);

      expect(await feeManager.highVolumeThreshold()).to.equal(1000);
      expect(await feeManager.lowVolumeThreshold()).to.equal(500);
      expect(await feeManager.highVolatilityValue()).to.equal(150);
      expect(await feeManager.lowVolatilityValue()).to.equal(80);
      expect(await feeManager.defaultVolatilityCoefficient()).to.equal(100);
    });
  });

  describe("pause/unpause protection", function () {
    it("blocks setVolatilityTiers when paused", async function () {
      await feeManager.pause();
      const tiers = [
        { volumeThreshold: ethers.parseUnits("10", 18), volatilityValue: 110 }
      ];
      await expect(
        feeManager.setVolatilityTiers(tiers)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("blocks setVolatilityParams when paused", async function () {
      await feeManager.pause();
      await expect(
        feeManager.setVolatilityParams(1, 1, 1, 1, 1)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("allows operations after unpause", async function () {
      await feeManager.pause();
      await feeManager.unpause();

      const tiers = [
        { volumeThreshold: ethers.parseUnits("5", 18), volatilityValue: 105 }
      ];
      await expect(feeManager.setVolatilityTiers(tiers)).not.to.be.reverted;
      await expect(feeManager.setVolatilityParams(10, 5, 120, 80, 100)).not.to.be.reverted;
    });
  });
});
