const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("StakingModule: unstake branches via IBITIcoin proxy", function () {
  const DECIMALS = 8;
  const MONTH    = 30 * 24 * 3600; // 30 days
  const GRACE    = 180 * 24 * 3600; // 180 days
  const DURATION = 3;              // 3-month plan

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

    // 3) Deploy IBITIcoin without stakingModule and daoModule
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

    // 4) Deploy StakingModule and link it
    staking = await (await ethers.getContractFactory("StakingModule"))
      .deploy(ibiti.target, discount.target);
    await staking.waitForDeployment();
    await ibiti.connect(deployer).setStakingModule(staking.target);

    // 5) Configure modules: DAO in discount, treasury and rewards in staking
    await discount.connect(deployer).setDAOModule(staking.target);
    await staking.connect(deployer).setTreasury(treasury.address);
    await staking.connect(deployer).setRewardConfig(DURATION, 2, 5); // nftCount=2, discountPercent=5

    // 6) Seed treasury & approve staking payouts
    const seed = ethers.parseUnits("1000", DECIMALS);
    await ibiti.connect(deployer).transfer(treasury.address, seed);
    await ibiti.connect(treasury).approve(staking.target, ethers.MaxUint256);

    // 7) Fund user
    await ibiti.connect(deployer).transfer(user.address, ethers.parseUnits("100", DECIMALS));
  });

  it("Early unstake: applies penalty, no reward, no NFTs", async function () {
    const amt = ethers.parseUnits("50", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amt);
    await ibiti.connect(user).stakeTokens(amt, DURATION);

    // Fast-forward to just before full term
    await network.provider.send("evm_increaseTime", [DURATION * MONTH - 10]);
    await network.provider.send("evm_mine");

    const penalty = (amt * 5n) / 100n; // 5% penalty
    const payout  = amt - penalty;
    await expect(() => ibiti.connect(user).unstakeTokens())
      .to.changeTokenBalances(
        ibiti,
        [staking, user],
        [ -payout, payout ]
      );
    expect(await discount.balanceOf(user.address)).to.equal(0n);
  });

  it("On-time unstake within grace: gives reward + mints NFTs", async function () {
    const amt = ethers.parseUnits("20", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amt);
    await ibiti.connect(user).stakeTokens(amt, DURATION);

    // Fast-forward just after full term
    await network.provider.send("evm_increaseTime", [DURATION * MONTH + 5]);
    await network.provider.send("evm_mine");

    const reward  = (amt * 5n) / 100n; // 5% reward
    const expected = amt + reward;
    await expect(() => ibiti.connect(user).unstakeTokens())
      .to.changeTokenBalances(
        ibiti,
        [staking, user],
        [ -amt, expected ]
      );
    expect(await discount.balanceOf(user.address)).to.equal(2n);
  });

  it("Expired unstake: sends full principal to treasury, user gets nothing", async function () {
    const amt = ethers.parseUnits("30", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amt);
    await ibiti.connect(user).stakeTokens(amt, DURATION);

    // Fast-forward beyond full term + grace period
    const time = DURATION * MONTH + GRACE + 1;
    await network.provider.send("evm_increaseTime", [time]);
    await network.provider.send("evm_mine");

    await expect(() => ibiti.connect(user).unstakeTokens())
      .to.changeTokenBalances(
        ibiti,
        [staking, treasury],
        [ -amt, amt ]
      );
  });
});
