const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Full Integration – NFTDiscount → StakingModule → Reward NFT", function () {
  const DECIMALS = 8;
  const MONTH    = 30 * 24 * 3600; // 30 days
  const { parseUnits } = ethers;

  let deployer, treasury, user;
  let feeMgr, statusMgr, bridgeMgr;
  let discount, token, staking;

  beforeEach(async function () {
    [deployer, treasury, user] = await ethers.getSigners();

    // 1) Mocks for fee, status and bridge
    const FeeMgrCF    = await ethers.getContractFactory("MockFeeManager");
    feeMgr    = await FeeMgrCF.deploy();
    await feeMgr.waitForDeployment();

    const StatusCF    = await ethers.getContractFactory("DummyUserStatus");
    statusMgr = await StatusCF.deploy();
    await statusMgr.waitForDeployment();

    const BridgeCF    = await ethers.getContractFactory("BridgeManager");
    bridgeMgr = await BridgeCF.deploy();
    await bridgeMgr.waitForDeployment();

    // 2) NFTDiscount
    const DiscountCF  = await ethers.getContractFactory("NFTDiscount");
    discount = await DiscountCF.deploy();
    await discount.waitForDeployment();

    // 3) Deploy IBITIcoin (with mocks)
    const IBITICoinCF = await ethers.getContractFactory("IBITIcoin");
    token = await IBITICoinCF.deploy(
      "IBITI", "IBI",
      deployer.address,      // founderWallet
      treasury.address,      // reserveWallet
      feeMgr.target,         // feeManager
      statusMgr.target,      // userStatusManager
      bridgeMgr.target,      // bridgeManager
      ethers.ZeroAddress,    // stakingModule (bind below)
      ethers.ZeroAddress     // daoModule
    );
    await token.waitForDeployment();

    // 4) Deploy & bind StakingModule to IBITIcoin
    const StakingCF = await ethers.getContractFactory("StakingModule");
    staking = await StakingCF.deploy(token.target, discount.target);
    await staking.waitForDeployment();
    await token.connect(deployer).setStakingModule(staking.target);

    // 5) Configure modules
    await discount.connect(deployer).setDAOModule(staking.target);
    await staking.connect(deployer).setTreasury(treasury.address);
    await staking.connect(deployer).setRewardConfig(1, 1, 5);

    // 6) Seed treasury for unstake payouts
    const seed = parseUnits("800", DECIMALS);
    await token.connect(deployer).transfer(treasury.address, seed);
    await token.connect(treasury).approve(staking.target, ethers.MaxUint256);

    // 7) Fund user and give them an existing NFT
    await token.connect(deployer).transfer(user.address, parseUnits("100", DECIMALS));
    await discount.connect(deployer).mint(user.address, 10, "ipfs://test-nft-uri");
  });

  it("user stakes 1 month and receives principal, reward, and bonus NFT", async function () {
    const stakeAmount = parseUnits("10", DECIMALS);

    // Initial balance check
    expect(await token.balanceOf(user.address)).to.equal(parseUnits("100", DECIMALS));

    // Stake 10 IBI on plan 1
    await token.connect(user).approve(staking.target, stakeAmount);
    await token.connect(user).stakeTokens(stakeAmount, 1);

    // Balance reduced by stakeAmount
    expect(await token.balanceOf(user.address)).to.equal(parseUnits("90", DECIMALS));

    // Fast-forward 31 days
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine", []);

    // Record balances and NFT count before unstake
    const nftBefore = await discount.balanceOf(user.address);
    const balBefore = await token.balanceOf(user.address);

    // Early unstake (new logic)
    await token.connect(user).unstakeTokens();

    // Compute reward: 0.1 IBI for 1-month stake (plan multiplier etc.)
    const expectedReward = parseUnits("0.1", DECIMALS);
    const expectedTotal  = stakeAmount + expectedReward;

    // Check token payout
    const balAfter = await token.balanceOf(user.address);
    expect(balAfter - balBefore).to.equal(expectedTotal);

    // Check NFT bonus minted
    expect(await discount.balanceOf(user.address)).to.equal(nftBefore + 1n);
  });
});
