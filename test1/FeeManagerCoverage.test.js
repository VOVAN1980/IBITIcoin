const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager Extended Coverage", function () {
  let owner, user, tokenMock, feeManager;

  before(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy ERC20Mock as token contract
    const ERC20MockCF = await ethers.getContractFactory("ERC20Mock");
    tokenMock = await ERC20MockCF.deploy(
      "TOK",
      "TOK",
      user.address,
      ethers.parseUnits("1000", 8)
    );
    await tokenMock.waitForDeployment();

    // Deploy FeeManager with tokenMock address
    const FeeManagerCF = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerCF.deploy(tokenMock.target);
    await feeManager.waitForDeployment();
  });

  describe("Admin functions", function () {
    it("setTokenContract reverts on zero address", async function () {
      await expect(feeManager.setTokenContract(ethers.ZeroAddress))
        .to.be.revertedWith("FM: zero tokenContract");
    });

    it("setTokenContract succeeds with valid address and emits event", async function () {
      const tx = await feeManager.setTokenContract(tokenMock.target);
      await expect(tx)
        .to.emit(feeManager, 'TokenContractSet')
        .withArgs(tokenMock.target);
      expect(await feeManager.tokenContract()).to.equal(tokenMock.target);
    });

    it("setHoldTracker reverts on zero address", async function () {
      await expect(feeManager.setHoldTracker(ethers.ZeroAddress))
        .to.be.revertedWith("FM: zero holdTracker");
    });

    it("setHoldTracker succeeds with valid address and emits event", async function () {
      // Deploy a dummy hold tracker
      const DummyCF = await ethers.getContractFactory("ReentrantMockToken");
      const dummy = await DummyCF.deploy();
      await dummy.waitForDeployment();

      const tx = await feeManager.setHoldTracker(dummy.target);
      await expect(tx)
        .to.emit(feeManager, 'HoldTrackerSet')
        .withArgs(dummy.target);
      expect(await feeManager.holdTracker()).to.equal(dummy.target);
    });
  });

  describe("Audit parameters without tiers", function () {
    it("sets volatilityCoefficient via old logic: high-volume branch", async function () {
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, 'VolatilityCoefficientUpdated')
        .withArgs(0);
      expect(await feeManager.volatilityCoefficient()).to.equal(0);
    });

    it("sets low-volatility branch when vol <= lowVolumeThreshold", async function () {
      // Configure thresholds: high=200, low=100
      await feeManager.setVolatilityParams(
        200,  // highVolumeThreshold
        100,  // lowVolumeThreshold
        500,  // highVolatilityValue
        123,  // lowVolatilityValue
        999   // defaultVolatilityCoefficient
      );
      // totalVolumePeriod is 0, so vol <= lowVolumeThreshold
      await expect(feeManager.auditParameters())
        .to.emit(feeManager, 'VolatilityCoefficientUpdated')
        .withArgs(123);
      expect(await feeManager.volatilityCoefficient()).to.equal(123);
    });
  });
});
