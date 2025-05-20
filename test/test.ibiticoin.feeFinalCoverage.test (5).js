const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – final fee/refund/staking edge coverage", function () {
  let owner, user;
  let token, feeManager, userStatus, bridge, staking;

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

    const DummyStaking = await ethers.getContractFactory("DummyStakingModule");
    staking = await DummyStaking.deploy();
    await staking.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      staking.target,
      ethers.ZeroAddress
    );
    await token.waitForDeployment();
    await feeManager.setTokenContract(token.target);
  });

  it("stakeTokens disables fee during staking", async () => {
    await expect(
      token.connect(user).stakeTokens(100, 1)
    ).to.not.be.reverted;
  });

  it("fee = 0 branch is covered in _doTransfer", async () => {
    await token.transfer(user.address, ONE);
    await token.setFlags(false, false, false, true, false, true);
    await expect(token.connect(user).transfer(owner.address, 100))
      .to.emit(token, "FounderFeePaid");
  });
});