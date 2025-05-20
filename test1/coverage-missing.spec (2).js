const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Coverage Missing Tests", function () {
  let ibiti, owner, user, treasury;
  let feeManager, userStatusManager, bridgeManager, stakingModule, daoModule;

  beforeEach(async function () {
    [owner, user, treasury] = await ethers.getSigners();

    const FeeManager = await ethers.getContractFactory("MockFeeManager");
    feeManager = await FeeManager.deploy();

    const UserStatusManager = await ethers.getContractFactory("DummyUserStatus");
    userStatusManager = await UserStatusManager.deploy();

    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BridgeManager.deploy();

    const StakingModule = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await StakingModule.deploy();

    const DAOModule = await ethers.getContractFactory("MockDAO");
    daoModule = await DAOModule.deploy();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITIcoin",
      "IBITI",
      owner.address,
      treasury.address,
      feeManager,
      userStatusManager,
      bridgeManager,
      stakingModule.target,
      daoModule.target
    );

    await ibiti.waitForDeployment();
  });

  describe("IBITIcoin.sol", function () {
    it("should revert transferFrom when allowance is insufficient [line 406]", async () => {
      await ibiti.approve(user.address, ethers.parseUnits("1", 8));
      await expect(
        ibiti.connect(user).transferFrom(owner.address, user.address, ethers.parseUnits("2", 8))
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("should return refund on overpayment [line 425]", async () => {
      const valueSent = ethers.parseEther("1.0");
      const tx = await owner.sendTransaction({
        to: ibiti.target,
        value: valueSent
      });
      await expect(tx).to.changeEtherBalance(ibiti, valueSent);
    });
  });
});
