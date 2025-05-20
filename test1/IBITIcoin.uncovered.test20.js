const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – settings and rescue functions", function () {
  let owner, other;
  let ibiti;
  const ZERO = ethers.ZeroAddress;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBI Token",       // name_
      "IBI",             // symbol_
      owner.address,     // founderWallet
      owner.address,     // reserveWallet
      ZERO,              // feeManager
      ZERO,              // userStatusManager
      ZERO,              // bridgeManager
      ZERO,              // stakingModule
      ZERO               // daoModule
    );
    await ibiti.waitForDeployment();
  });

  describe("toggle feature flags", function () {
    it("setDistributionEnabled toggles and emits", async function () {
      // по конструктору => true
      expect(await ibiti.distributionEnabled()).to.be.true;

      await expect(ibiti.setDistributionEnabled(false))
        .to.emit(ibiti, "DistributionEnabledUpdated")
        .withArgs(false);
      expect(await ibiti.distributionEnabled()).to.be.false;

      await ibiti.pause();
      await expect(ibiti.setDistributionEnabled(true))
        .to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });

    it("setPurchaseFeeEnabled toggles and emits", async function () {
      expect(await ibiti.purchaseFeeEnabled()).to.be.false;

      await expect(ibiti.setPurchaseFeeEnabled(true))
        .to.emit(ibiti, "PurchaseFeeEnabledUpdated")
        .withArgs(true);
      expect(await ibiti.purchaseFeeEnabled()).to.be.true;

      await ibiti.pause();
      await expect(ibiti.setPurchaseFeeEnabled(false))
        .to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });

    it("setTransferFeeEnabled toggles and emits", async function () {
      expect(await ibiti.transferFeeEnabled()).to.be.false;

      await expect(ibiti.setTransferFeeEnabled(true))
        .to.emit(ibiti, "TransferFeeEnabledUpdated")
        .withArgs(true);
      expect(await ibiti.transferFeeEnabled()).to.be.true;

      await ibiti.pause();
      await expect(ibiti.setTransferFeeEnabled(false))
        .to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });

    it("setSaleFeeEnabled toggles and emits", async function () {
      // по конструктору => true
      expect(await ibiti.saleFeeEnabled()).to.be.true;

      await expect(ibiti.setSaleFeeEnabled(false))
        .to.emit(ibiti, "SaleFeeEnabledUpdated")
        .withArgs(false);
      expect(await ibiti.saleFeeEnabled()).to.be.false;

      await ibiti.pause();
      await expect(ibiti.setSaleFeeEnabled(true))
        .to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });

    it("setActivityTracking toggles and emits", async function () {
      expect(await ibiti.activityTrackingEnabled()).to.be.false;

      await expect(ibiti.setActivityTracking(true))
        .to.emit(ibiti, "ActivityTrackingSet")
        .withArgs(true);
      expect(await ibiti.activityTrackingEnabled()).to.be.true;

      await ibiti.pause();
      await expect(ibiti.setActivityTracking(false))
        .to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });

    it("setBurnEnabled toggles flag (no event)", async function () {
      // по конструктору => true
      expect(await ibiti.burnEnabled()).to.be.true;

      await ibiti.setBurnEnabled(false);
      expect(await ibiti.burnEnabled()).to.be.false;

      await ibiti.pause();
      await expect(ibiti.setBurnEnabled(true))
        .to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });

    it("setBurnPercentage accepts <=100, reverts >100", async function () {
      await expect(ibiti.setBurnPercentage(50))
        .to.emit(ibiti, "BurnPercentageUpdated")
        .withArgs(50);
      expect(await ibiti.burnPercentage()).to.equal(50);

      await expect(ibiti.setBurnPercentage(101)).to.be.reverted;
    });
  });

  describe("updating module addresses", function () {
    let mockFee, mockStatus, mockBridge, mockStake;

    beforeEach(async function () {
      // деплоим чистые контракты-моки
      const BM = await ethers.getContractFactory("BridgeManager");
      mockBridge = (await BM.deploy()).target;

      const FM = await ethers.getContractFactory("FeeManager");
      mockFee = (await FM.deploy(ibiti.target)).target;

      const USM = await ethers.getContractFactory("UserStatusManager");
      mockStatus = (await USM.deploy()).target;

      const SM = await ethers.getContractFactory("DummyStakingModule");
      mockStake = (await SM.deploy()).target;
    });

    it("setFeeManager rejects zero and accepts non-zero", async function () {
      await expect(ibiti.setFeeManager(ZERO)).to.be.reverted;
      await ibiti.setFeeManager(mockFee);
      expect(await ibiti.feeManager()).to.equal(mockFee);
    });

    it("setDistributionWallet rejects zero and accepts non-zero", async function () {
      await expect(ibiti.setDistributionWallet(ZERO)).to.be.reverted;
      await ibiti.setDistributionWallet(other.address);
      expect(await ibiti.distributionWallet()).to.equal(other.address);
    });

    it("setUserStatusManager rejects zero and accepts non-zero", async function () {
      await expect(ibiti.setUserStatusManager(ZERO)).to.be.reverted;
      await ibiti.setUserStatusManager(mockStatus);
      expect(await ibiti.userStatusManager()).to.equal(mockStatus);
    });

    it("setBridgeManager rejects zero and accepts non-zero", async function () {
      await expect(ibiti.setBridgeManager(ZERO)).to.be.reverted;
      await ibiti.setBridgeManager(mockBridge);
      expect(await ibiti.bridgeManager()).to.equal(mockBridge);
    });

    it("setStakingModule rejects zero and accepts non-zero", async function () {
      await expect(ibiti.setStakingModule(ZERO)).to.be.reverted;
      await ibiti.setStakingModule(mockStake);
      expect(await ibiti.stakingModule()).to.equal(mockStake);
    });
  });

  describe("rescueERC20 and rescueETH", function () {
    let mockToken;

    beforeEach(async function () {
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      mockToken = await ERC20Mock.deploy("TKN", "TKN", owner.address, 1000);
    });

    it("rescueERC20 reverts on zero args, transfers and emits", async function () {
      await expect(
        ibiti.rescueERC20(ZERO, other.address, 1)
      ).to.be.reverted;
      await expect(
        ibiti.rescueERC20(mockToken.target, ZERO, 1)
      ).to.be.reverted;

      await mockToken.transfer(ibiti.target, 10);
      await expect(
        ibiti.rescueERC20(mockToken.target, other.address, 5)
      )
        .to.emit(ibiti, "ERC20Rescued")
        .withArgs(mockToken.target, other.address, 5);
      expect(await mockToken.balanceOf(other.address)).to.equal(5);
    });

    it("rescueETH reverts on zero, transfers ETH and emits", async function () {
      await expect(ibiti.rescueETH(ZERO)).to.be.reverted;

      await owner.sendTransaction({
        to: ibiti.target,
        value: ethers.parseEther("1")
      });
      const before = await ethers.provider.getBalance(other.address);

      await expect(ibiti.rescueETH(other.address))
        .to.emit(ibiti, "ETHRescued")
        .withArgs(other.address, ethers.parseEther("1"));

      const after = await ethers.provider.getBalance(other.address);
      expect(after - before).to.equal(ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(ibiti.target)).to.equal(0n);
    });
  });
}); 
