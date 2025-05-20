const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("StakingModule – unstake paths coverage (193, 262)", function () {
  const DECIMALS = 8;
  const MONTH    = 30 * 24 * 3600; // 30 days
  const GRACE    = 180 * 24 * 3600; // 180 days
  const DURATION = 1;              // 1-month plan

  let deployer, user, treasury;
  let feeMgr, statusMgr, bridgeMgr;
  let discount, ibiti, staking;

  beforeEach(async function () {
    [deployer, user, treasury] = await ethers.getSigners();

    // Deploy mocks
    feeMgr    = await (await ethers.getContractFactory("MockFeeManager")).deploy();
    statusMgr = await (await ethers.getContractFactory("DummyUserStatus")).deploy();
    bridgeMgr = await (await ethers.getContractFactory("DummyBridgeManager")).deploy();
    await Promise.all([
      feeMgr.waitForDeployment(),
      statusMgr.waitForDeployment(),
      bridgeMgr.waitForDeployment()
    ]);

    // Deploy NFTDiscount
    discount = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await discount.waitForDeployment();

    // Deploy IBITIcoin
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

    // Deploy and bind StakingModule
    staking = await (await ethers.getContractFactory("StakingModule")).deploy(
      ibiti.target,
      discount.target
    );
    await staking.waitForDeployment();
    await ibiti.connect(deployer).setStakingModule(staking.target);

    // Configure modules
    await discount.connect(deployer).setDAOModule(staking.target);
    await staking.connect(deployer).setTreasury(treasury.address);
    // nftCount=1, discountPercent=5
    await staking.connect(deployer).setRewardConfig(DURATION, 5, 1);

    // Seed treasury and approve
    const seed = ethers.parseUnits("1000", DECIMALS);
    await ibiti.connect(deployer).transfer(treasury.address, seed);
    await ibiti.connect(treasury).approve(staking.target, ethers.MaxUint256);

    // Fund user and approve stake pull
    await ibiti.connect(deployer).transfer(user.address, ethers.parseUnits("100", DECIMALS));
    await ibiti.connect(user).approve(staking.target, ethers.MaxUint256);
  });

  it("should apply penalty on early unstake (line 193)", async function () {
    const amt = ethers.parseUnits("50", DECIMALS);
    await ibiti.connect(user).stakeTokens(amt, DURATION);

    // Before full term
    await network.provider.send("evm_increaseTime", [10 * 24 * 3600]);
    await network.provider.send("evm_mine");

    const penalty = (amt * 1n) / 100n;
    await expect(ibiti.connect(user).unstakeTokens())
      .to.emit(staking, "Unstaked")
      .withArgs(user.address, amt, 0, penalty, 0, false);
  });

  it("should give reward and NFTs during grace period (line 262)", async function () {
    const amt = ethers.parseUnits("80", DECIMALS);
    await ibiti.connect(user).stakeTokens(amt, DURATION);

    // Enter grace period
    await network.provider.send("evm_increaseTime", [DURATION * MONTH + 5]);
    await network.provider.send("evm_mine");

    const reward = (amt * 1n) / 100n;
    const nftCount = 5;
    await expect(ibiti.connect(user).unstakeTokens())
      .to.emit(staking, "Unstaked")
      .withArgs(user.address, amt, reward, 0, nftCount, false);
  });

  it("should send full amount to treasury after grace period (line 278)", async function () {
    const amt = ethers.parseUnits("30", DECIMALS);
    await ibiti.connect(user).stakeTokens(amt, DURATION);

    // After term + grace
    await network.provider.send("evm_increaseTime", [DURATION * MONTH + GRACE + 1]);
    await network.provider.send("evm_mine");

    await expect(ibiti.connect(user).unstakeTokens())
      .to.emit(staking, "Unstaked")
      .withArgs(user.address, amt, 0, 0, 0, true);
  });
});
