const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("StakingModule: unstake branches via IBITIcoin proxy", function () {
  const DECIMALS = 8;
  const { parseUnits } = ethers;
  const MONTH    = 30 * 24 * 3600;   // 30 days
  const GRACE    = 180 * 24 * 3600;  // 180 days
  const DURATION = 3;                // 3-month plan

  let deployer, treasury, user;
  let feeMgr, statusMgr, bridgeMgr;
  let discount, ibiti, staking;

  beforeEach(async function () {
    [deployer, treasury, user] = await ethers.getSigners();

    // 1) Deploy mocks
    feeMgr    = await (await ethers.getContractFactory("MockFeeManager")).deploy();
    statusMgr = await (await ethers.getContractFactory("DummyUserStatus")).deploy();
    bridgeMgr = await (await ethers.getContractFactory("BridgeManager")).deploy();
    await Promise.all([
      feeMgr.waitForDeployment(),
      statusMgr.waitForDeployment(),
      bridgeMgr.waitForDeployment()
    ]);

    // 2) Deploy NFTDiscount
    discount = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await discount.waitForDeployment();

    // 3) Deploy IBITIcoin (no stakingModule bound yet)
    const IBITICoinCF = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITICoinCF.deploy(
      "IBITI", "IBI",
      deployer.address,
      treasury.address,
      feeMgr.target,
      statusMgr.target,
      bridgeMgr.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await ibiti.waitForDeployment();

    // 4) Deploy & bind StakingModule
    staking = await (await ethers.getContractFactory("StakingModule"))
      .deploy(ibiti.target, discount.target);
    await staking.waitForDeployment();
    await ibiti.connect(deployer).setStakingModule(staking.target);

    // 5) Configure modules
    await discount.connect(deployer).setDAOModule(staking.target);
    await staking.connect(deployer).setTreasury(treasury.address);
    // planId = DURATION, rewardPct = 5, nftCount = 2
    await staking.connect(deployer).setRewardConfig(DURATION, 5, 2);

    // 6) Seed treasury & approve
    const seed = parseUnits("1000", DECIMALS);
    await ibiti.connect(deployer).transfer(treasury.address, seed);
    await ibiti.connect(treasury).approve(staking.target, ethers.MaxUint256);

    // 7) Fund user
    await ibiti.connect(deployer).transfer(user.address, parseUnits("100", DECIMALS));
  });

  async function warp(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  it("Early unstake: applies penalty, no reward, no NFTs", async function () {
    const amount = parseUnits("50", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amount);
    await ibiti.connect(user).stakeTokens(amount, DURATION);

    // Warp to just before full term
    await warp(DURATION * MONTH - 10);

    const balUserBefore  = await ibiti.balanceOf(user.address);
    const balTreasBefore = await ibiti.balanceOf(treasury.address);
    const nftBefore      = await discount.balanceOf(user.address);

    await ibiti.connect(user).unstakeTokens();

    // Penalty = 5% of amount
    const penalty = amount * 5n / 100n;
    expect(await ibiti.balanceOf(user.address) - balUserBefore)
      .to.equal(amount - penalty);
    expect(await ibiti.balanceOf(treasury.address)).to.equal(balTreasBefore);
    expect(await discount.balanceOf(user.address)).to.equal(nftBefore);
  });

  it("On-time unstake within grace: gives reward + mints NFTs", async function () {
    const amount = parseUnits("20", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amount);
    await ibiti.connect(user).stakeTokens(amount, DURATION);

    // Warp to just after full term
    await warp(DURATION * MONTH + 5);

    const balUserBefore  = await ibiti.balanceOf(user.address);
    const balTreasBefore = await ibiti.balanceOf(treasury.address);
    const nftBefore      = await discount.balanceOf(user.address);

    await ibiti.connect(user).unstakeTokens();

    // Reward = 5% of amount
    const reward = amount * 5n / 100n;
    expect(await ibiti.balanceOf(user.address) - balUserBefore)
      .to.equal(amount + reward);
    expect(balTreasBefore - await ibiti.balanceOf(treasury.address))
      .to.equal(reward);

    // NFT count minted = reward percentage (5)
    const minted = (await discount.balanceOf(user.address)) - nftBefore;
    expect(minted).to.equal(5n);
  });

  it("Expired unstake: sends full principal to treasury, user gets nothing", async function () {
    const amount = parseUnits("30", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amount);
    await ibiti.connect(user).stakeTokens(amount, DURATION);

    // Warp beyond term + grace
    await warp(DURATION * MONTH + GRACE + 10);

    const balUserBefore  = await ibiti.balanceOf(user.address);
    const balTreasBefore = await ibiti.balanceOf(treasury.address);

    await ibiti.connect(user).unstakeTokens();

    expect(await ibiti.balanceOf(user.address)).to.equal(balUserBefore);
    expect(await ibiti.balanceOf(treasury.address) - balTreasBefore)
      .to.equal(amount);
  });
});
