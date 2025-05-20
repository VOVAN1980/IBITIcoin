const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule Extra Tests", function () {
  let stakingModule, token, nftDiscount, ibiti;
  let owner, staker, treasury;

  beforeEach(async function () {
    [owner, staker, treasury] = await ethers.getSigners();

    // Deploy mocks
    const FeeManager = await ethers.getContractFactory("MockFeeManager");
    const StatusMgr = await ethers.getContractFactory("DummyUserStatus");
    const BridgeMgr = await ethers.getContractFactory("DummyBridgeManager");

    const feeMgr = await FeeManager.deploy();
    const statusMgr = await StatusMgr.deploy();
    const bridgeMgr = await BridgeMgr.deploy();
    await Promise.all([
      feeMgr.waitForDeployment(),
      statusMgr.waitForDeployment(),
      bridgeMgr.waitForDeployment()
    ]);

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy IBITI token
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address,
      treasury.address,
      feeMgr.target,
      statusMgr.target,
      bridgeMgr.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await ibiti.waitForDeployment();

    // Deploy staking module
    const StakingModule = await ethers.getContractFactory("StakingModule");
    stakingModule = await StakingModule.deploy(ibiti.target, nftDiscount.target);
    await stakingModule.waitForDeployment();
    await ibiti.setStakingModule(stakingModule.target);

    // Fund staker
    await ibiti.transfer(staker.address, ethers.parseUnits("1000", 8));
    await ibiti.connect(staker).approve(stakingModule.target, ethers.MaxUint256);
  });

  it("should revert staking with zero amount", async function () {
    await expect(
      ibiti.connect(staker).stakeTokens(0n, 3)
    ).to.be.revertedWith("Amount zero");
  });

  it("should stake tokens successfully", async function () {
    const amt = ethers.parseUnits("100", 8);
    await ibiti.connect(staker).stakeTokens(amt, 3);

    const count = await stakingModule.getStakeCount(staker.address);
    expect(count).to.equal(1);

    const stake = await stakingModule.getStakeInfo(staker.address, 0);
    expect(stake.amount).to.equal(amt);
  });

  it("should revert unstake if treasury is not set", async function () {
    const amt = ethers.parseUnits("100", 8);
    await ibiti.connect(staker).stakeTokens(amt, 3);

    await expect(
      ibiti.connect(staker).unstakeTokens()
    ).to.be.revertedWith("Treasury not set");
  });
});