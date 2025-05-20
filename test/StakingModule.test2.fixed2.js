const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("StakingModule – full integration via IBITIcoin proxy", function () {
  const DECIMALS = 8;
  const MONTH    = 30 * 24 * 3600; // 30 days

  let deployer, treasury, user;
  let feeMgr, statusMgr, bridgeMgr;
  let discount, ibiti, staking;

  beforeEach(async function () {
    [deployer, treasury, user] = await ethers.getSigners();

    // 1) Mocks
    feeMgr    = await (await ethers.getContractFactory("MockFeeManager")).deploy();
    statusMgr = await (await ethers.getContractFactory("DummyUserStatus")).deploy();
    bridgeMgr = await (await ethers.getContractFactory("BridgeManager")).deploy();
    await Promise.all([
      feeMgr.waitForDeployment(),
      statusMgr.waitForDeployment(),
      bridgeMgr.waitForDeployment()
    ]);

    // 2) NFTDiscount
    discount = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await discount.waitForDeployment();

    // 3) IBITIcoin without stakingModule
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

    // 4) StakingModule
    staking = await (await ethers.getContractFactory("StakingModule"))
      .deploy(ibiti.target, discount.target);
    await staking.waitForDeployment();
    await ibiti.connect(deployer).setStakingModule(staking.target);

    // 5) Configure modules (now mints 1 NFT on full unstake)
    await discount.connect(deployer).setDAOModule(staking.target);
    await staking.connect(deployer).setTreasury(treasury.address);
    await staking.connect(deployer).setRewardConfig(1, 1, 1); // nftCount=1

    // 6) Seed treasury & approve
    const seed = ethers.parseUnits("1000", DECIMALS);
    await ibiti.connect(deployer).transfer(treasury.address, seed);
    await ibiti.connect(treasury).approve(staking.target, ethers.MaxUint256);

    // 7) Fund user
    await ibiti.connect(deployer).transfer(user.address, ethers.parseUnits("500", DECIMALS));
  });

  it("only owner can set treasury and rewardConfig", async function () {
    await expect(
      staking.connect(user).setTreasury(user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      staking.connect(user).setRewardConfig(1, 1, 1)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("pause/unpause blocks stake and unstake", async function () {
    await staking.connect(deployer).pause();
    await ibiti.connect(user).approve(
      staking.target,
      ethers.parseUnits("10", DECIMALS)
    );
    await expect(
      ibiti.connect(user).stakeTokens(ethers.parseUnits("10", DECIMALS), 1)
    ).to.be.revertedWith("Pausable: paused");

    await staking.connect(deployer).unpause();
    await expect(
      ibiti.connect(user).stakeTokens(ethers.parseUnits("10", DECIMALS), 1)
    ).to.not.be.reverted;

    await staking.connect(deployer).pause();
    await network.provider.send("evm_increaseTime", [MONTH + 1]);
    await network.provider.send("evm_mine");
    await expect(
      ibiti.connect(user).unstakeTokens()
    ).to.be.revertedWith("Pausable: paused");
  });

  it("stake and unstake on-time: principal + reward and 1 NFT", async function () {
    const amt = ethers.parseUnits("100", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amt);
    await ibiti.connect(user).stakeTokens(amt, 1);

    // Fast-forward 1 month + 1s
    await network.provider.send("evm_increaseTime", [MONTH + 1]);
    await network.provider.send("evm_mine");

    const expectedPayout = (amt * 101n) / 100n;
    await expect(() => ibiti.connect(user).unstakeTokens())
      .to.changeTokenBalances(
        ibiti,
        [staking, user],
        [ -amt, expectedPayout ]
      );

    // Single NFT minted on full-duration unstake
    expect(await discount.balanceOf(user.address)).to.equal(1n);
  });

  it("early unstake applies penalty under new logic", async function () {
    const amt = ethers.parseUnits("50", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amt);
    await ibiti.connect(user).stakeTokens(amt, 1);

    // Fast-forward 29 days
    await network.provider.send("evm_increaseTime", [29 * 24 * 3600]);
    await network.provider.send("evm_mine");

    const expectedPayout = (amt * 99n) / 100n;
    await expect(() => ibiti.connect(user).unstakeTokens())
      .to.changeTokenBalances(
        ibiti,
        [staking, user],
        [ -expectedPayout, expectedPayout ]
      );
  });

  it("expired unstake sends all principal to treasury", async function () {
    const amt = ethers.parseUnits("20", DECIMALS);
    await ibiti.connect(user).approve(staking.target, amt);
    await ibiti.connect(user).stakeTokens(amt, 1);

    // Fast-forward 1 month + 180 days grace + 1s
    await network.provider.send("evm_increaseTime", [(30 + 180) * 24 * 3600 + 1]);
    await network.provider.send("evm_mine");

    await expect(() => ibiti.connect(user).unstakeTokens())
      .to.changeTokenBalances(
        ibiti,
        [staking, treasury],
        [ -amt, amt ]
      );
  });
});
