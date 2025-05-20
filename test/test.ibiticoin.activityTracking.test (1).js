
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – activity tracking coverage", function () {
  let owner, user;
  let token, feeManager, userStatus, bridge;

  const ONE = ethers.parseUnits("1", 8);

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000000", 8));
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    bridge = await BM.deploy();
    await bridge.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await token.waitForDeployment();

    await feeManager.setTokenContract(token.target); // важно для updateActivity
    await token.setCoinPriceBNB(1);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
  });

  it("transfer triggers updateActivity when activityTracking is enabled", async () => {
    await token.setFlags(false, false, false, true, false, true); // enable transferFee + activityTracking
    await token.connect(owner).transfer(user.address, ONE);
    await expect(token.connect(user).transfer(owner.address, 100))
      .to.emit(token, "FounderFeePaid");
  });

  it("purchaseCoinBNB triggers updateActivity when activityTracking is enabled", async () => {
    await token.setActivityTracking(true);
    await expect(token.connect(user).purchaseCoinBNB({ value: 1 }))
      .to.emit(token, "CoinPurchased");
  });

  it("purchaseCoinToken triggers updateActivity when activityTracking is enabled", async () => {
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const payToken = await ERC20.deploy("USD", "USD", user.address, ONE);
    await payToken.waitForDeployment();

    await payToken.connect(user).approve(token.target, ONE);
    await token.setActivityTracking(true);
    await token.setAcceptedPayment(payToken.target, true);
    await token.setCoinPriceToken(payToken.target, 1);

    await expect(token.connect(user).purchaseCoinToken(payToken.target, 1))
      .to.emit(token, "CoinPurchased");
  });
});
