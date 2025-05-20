const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule – NFTDiscount and reward minting", function () {
  let owner, user;
  let ibiti, staking, discount;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const FeeMgr = await ethers.getContractFactory("MockFeeManager");
    const StatusMgr = await ethers.getContractFactory("DummyUserStatus");
    const BridgeMgr = await ethers.getContractFactory("DummyBridgeManager");
    const feeMgr = await FeeMgr.deploy();
    const statusMgr = await StatusMgr.deploy();
    const bridgeMgr = await BridgeMgr.deploy();
    await Promise.all([
      feeMgr.waitForDeployment(),
      statusMgr.waitForDeployment(),
      bridgeMgr.waitForDeployment()
    ]);

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    discount = await NFTDiscount.deploy();
    await discount.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address,
      owner.address,
      feeMgr.target,
      statusMgr.target,
      bridgeMgr.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await ibiti.waitForDeployment();

    const Staking = await ethers.getContractFactory("StakingModule");
    staking = await Staking.deploy(ibiti.target, discount.target);
    await staking.waitForDeployment();

    await ibiti.setStakingModule(staking.target);
    await discount.setDAOModule(staking.target);
  });

  it("mints 2 reward NFTs via stake → unstake", async function () {
    const planId = 3;
    const stakeAmt = ethers.parseUnits("100", 8);

    await staking.setRewardConfig(planId, 2, 5);
    await ibiti.transfer(user.address, stakeAmt);
    await ibiti.connect(user).approve(staking.target, stakeAmt);
    await staking.setTreasury(owner.address);
    await ibiti.connect(owner).approve(staking.target, ethers.MaxUint256);

    await ibiti.connect(user).stakeTokens(stakeAmt, planId);
    await network.provider.send("evm_increaseTime", [planId * 30 * 24 * 3600 + 10]);
    await network.provider.send("evm_mine");

    await ibiti.connect(user).unstakeTokens();

    const balance = await discount.balanceOf(user.address);
    expect(balance).to.equal(2);
  });
});
