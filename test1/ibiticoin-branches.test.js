const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin - uncovered branches", function () {
  let owner, reserve, user, other;
  let token, dao, feeToken;
  let feeManager, userStatus, bridge, staking, nft;

  beforeEach(async function () {
    [owner, reserve, user, other] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    feeToken = await ERC20Mock.deploy(
      "FeeToken", "FEE",
      user.address,
      ethers.parseUnits("5000", 8)
    );
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const UserStatusManager = await ethers.getContractFactory("UserStatusManager");
    userStatus = await UserStatusManager.deploy();
    await userStatus.waitForDeployment();

    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    bridge = await BridgeManager.deploy();
    await bridge.waitForDeployment();

    const DummyStakingModule = await ethers.getContractFactory("DummyStakingModule");
    staking = await DummyStakingModule.deploy();
    await staking.waitForDeployment();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    const TestDAOModule = await ethers.getContractFactory("TestDAOModule");
    dao = await TestDAOModule.deploy(feeToken.target, nft.target);
    await dao.waitForDeployment();

    // register voters
    await feeToken.connect(user).approve(dao.target, ethers.parseUnits("1000", 8));
    await dao.connect(user).registerVoter();
    await feeToken.connect(user).transfer(owner.address, ethers.parseUnits("1000", 8));
    await feeToken.connect(owner).approve(dao.target, ethers.parseUnits("1000", 8));
    await dao.connect(owner).registerVoter();

    const IBITIcoin = await ethers.getContractFactory("IBITIcoin");
    token = await IBITIcoin.deploy(
      "IBITI", "IBI",
      owner.address,
      reserve.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      staking.target,
      dao.target
    );
    await token.waitForDeployment();

    await token.setNFTDiscount(nft.target);
    await feeManager.setTokenContract(token.target);
    await token.setFeeDisabled(owner.address, true);
    await token.setFeeDisabled(user.address, true);

    const reserveBalance = await token.balanceOf(reserve.address);
    await token.connect(owner).transfer(user.address, reserveBalance / 2n);
  });

  it("should revert if founder or reserve wallet is zero", async function () {
    const IBITIcoin = await ethers.getContractFactory("IBITIcoin");
    await expect(IBITIcoin.deploy(
      "IBITI", "IBI",
      ethers.ZeroAddress,
      reserve.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      staking.target,
      dao.target
    )).to.be.reverted;
  });

  it("should transfer without fee when feeDisabledFor", async function () {
    const amount = await token.balanceOf(user.address);
    await expect(
      token.connect(user).transfer(other.address, amount)
    ).to.emit(token, "Transfer");
  });

  it("should set holding duration > 0 after first transfer", async function () {
    const amount = await token.balanceOf(user.address);
    await token.connect(user).transfer(other.address, amount);
    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");
    const duration = await token.getHoldingDuration(other.address);
    expect(duration).to.be.gt(0);
  });

  it("should revert DAO call when module registered but user not voter", async function () {
    await token.connect(owner).enableDAO(true);
    await token.connect(owner).setDaoWallet(dao.target);
    await expect(
      token.connect(user).createProposalSimple("Proposal A")
    ).to.be.revertedWith("Need threshold tokens");
  });
});
