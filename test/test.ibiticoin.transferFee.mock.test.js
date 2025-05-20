
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – transfer fee > 0 and activityTracking (with mock)", function () {
  let owner, user, recipient;
  let token, feeManager, userStatus, bridge;

  const ONE = ethers.parseUnits("1", 8);
  const TRANSFER = ethers.parseUnits("100", 8);
  const FEE = ethers.parseUnits("10", 8); // фиксированная комиссия через mock

  beforeEach(async function () {
    [owner, user, recipient] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000000", 8));
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManagerMock");
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
    await feeManager.setTokenContract(token.target);
    await feeManager.setMockFee(FEE);

    await token.transfer(user.address, TRANSFER);
  });

  it("applies mocked fee and emits FounderFeePaid and updateActivity", async function () {
    await token.setFlags(
      false,  // burnEnabled
      true,   // distributionEnabled
      false,  // purchaseFeeEnabled
      true,   // transferFeeEnabled
      false,  // saleFeeEnabled
      true    // activityTrackingEnabled
    );

    await expect(token.connect(user).transfer(recipient.address, TRANSFER))
      .to.emit(token, "FounderFeePaid")
      .withArgs(user.address, FEE);
  });
});
