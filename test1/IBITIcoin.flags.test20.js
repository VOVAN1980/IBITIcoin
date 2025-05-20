const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Flag Getters", function () {
  let owner, other, ibiti;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBI Token",       // name_
      "IBI",             // symbol_
      owner.address,     // founderWallet
      owner.address,     // reserveWallet
      ethers.ZeroAddress,// feeManager
      ethers.ZeroAddress,// userStatusManager
      ethers.ZeroAddress,// bridgeManager
      ethers.ZeroAddress,// stakingModule
      ethers.ZeroAddress // daoModule
    );
    await ibiti.waitForDeployment();
  });

  it("initial getter values match constructor flags", async function () {
    // Конструктор задаёт:
    // burnEnabled = true, distributionEnabled = true,
    // purchaseFeeEnabled = false, transferFeeEnabled = false,
    // saleFeeEnabled = true, activityTrackingEnabled = false
    expect(await ibiti.burnEnabled()).to.equal(true);
    expect(await ibiti.distributionEnabled()).to.equal(true);
    expect(await ibiti.purchaseFeeEnabled()).to.equal(false);
    expect(await ibiti.transferFeeEnabled()).to.equal(false);
    expect(await ibiti.saleFeeEnabled()).to.equal(true);
    expect(await ibiti.activityTrackingEnabled()).to.equal(false);
  });

  it("setters update getters correctly", async function () {
    // burnEnabled
    await ibiti.setBurnEnabled(false);
    expect(await ibiti.burnEnabled()).to.equal(false);
    await ibiti.setBurnEnabled(true);

    // distributionEnabled
    await ibiti.setDistributionEnabled(false);
    expect(await ibiti.distributionEnabled()).to.equal(false);
    await ibiti.setDistributionEnabled(true);

    // purchaseFeeEnabled
    await ibiti.setPurchaseFeeEnabled(true);
    expect(await ibiti.purchaseFeeEnabled()).to.equal(true);
    await ibiti.setPurchaseFeeEnabled(false);

    // transferFeeEnabled
    await ibiti.setTransferFeeEnabled(true);
    expect(await ibiti.transferFeeEnabled()).to.equal(true);
    await ibiti.setTransferFeeEnabled(false);

    // saleFeeEnabled
    await ibiti.setSaleFeeEnabled(false);
    expect(await ibiti.saleFeeEnabled()).to.equal(false);
    await ibiti.setSaleFeeEnabled(true);

    // activityTrackingEnabled
    await ibiti.setActivityTracking(true);
    expect(await ibiti.activityTrackingEnabled()).to.equal(true);
    await ibiti.setActivityTracking(false);
  });
});
