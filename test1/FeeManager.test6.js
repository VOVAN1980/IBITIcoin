const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – activity and volatility logic", function () {
  let feeManager;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    // Deploy mock ERC20 to serve as tokenContract
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenMock = await ERC20Mock.deploy("MTK", "MTK", owner.address, ethers.parseUnits("1000", 8));
    await tokenMock.waitForDeployment();

    // Deploy FeeManager with mock token as tokenContract
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(tokenMock.target);
    await feeManager.waitForDeployment();
    // Allow owner to call updateActivity
    await feeManager.connect(owner).setTokenContract(owner.address);
  });

  it("updateActivity increments and resets after time decay", async function () {
    // First update emits event
    await expect(feeManager.updateActivity(user.address, 100, false))
      .to.emit(feeManager, "ActivityUpdated");

    // Second update emits event
    await expect(feeManager.updateActivity(user.address, 50, true))
      .to.emit(feeManager, "ActivityUpdated");

    // Fast-forward beyond timeDecay (7 days)
    const decay = await feeManager.timeDecay();
    await ethers.provider.send("evm_increaseTime", [Number(decay) + 1]);
    await ethers.provider.send("evm_mine");

    // After decay, reset and emits
    await expect(feeManager.updateActivity(user.address, 20, false))
      .to.emit(feeManager, "ActivityUpdated");
  });

  describe("volatility coefficient old logic (no tiers)", function () {
    beforeEach(async function () {
      // Set thresholds: high=100, low=50, highVol=200, lowVol=25, defaultVol=75
      await feeManager.setVolatilityParams(100, 50, 200, 25, 75);
    });

    it("sets lowVolatilityValue when totalVolumePeriod <= lowThreshold", async function () {
      // No activity => totalVolumePeriod = 0
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(25);
    });

    it("sets highVolatilityValue when totalVolumePeriod >= highThreshold", async function () {
      await feeManager.connect(owner).updateActivity(user.address, 150, false);
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(200);
    });

    it("sets defaultVolatilityCoefficient when between thresholds", async function () {
      await feeManager.connect(owner).updateActivity(user.address, 75, false);
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(75);
    });
  });

  describe("volatility coefficient tier logic", function () {
    beforeEach(async function () {
      // Set default for tiers logic
      await feeManager.setVolatilityParams(0, 0, 0, 0, 111);
      const tiers = [
        { volumeThreshold: 100, volatilityValue: 120 },
        { volumeThreshold: 200, volatilityValue: 140 }
      ];
      await feeManager.setVolatilityTiers(tiers);
    });

    it("uses defaultVolatilityCoefficient when vol below first tier", async function () {
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(111);
    });

    it("applies first tier when vol >= first threshold", async function () {
      await feeManager.connect(owner).updateActivity(user.address, 150, false);
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(120);
    });

    it("applies second tier when vol >= second threshold", async function () {
      await feeManager.connect(owner).updateActivity(user.address, 250, false);
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(140);
    });
  });
});
