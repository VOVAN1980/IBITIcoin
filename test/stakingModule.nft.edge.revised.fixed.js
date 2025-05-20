const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule – Edge cases for NFT minting", function () {
  let owner, treasury, user;
  let feeMgr, statusMgr, bridgeMgr, discount;
  let token, staking;

  const DECIMALS = 8;
  const MONTH = 30 * 24 * 3600;

  beforeEach(async function () {
    [owner, treasury, user] = await ethers.getSigners();

    const FeeMgrCF = await ethers.getContractFactory("MockFeeManager");
    feeMgr = await FeeMgrCF.deploy();
    await feeMgr.waitForDeployment();

    const StatusCF = await ethers.getContractFactory("DummyUserStatus");
    statusMgr = await StatusCF.deploy();
    await statusMgr.waitForDeployment();

    const BridgeCF = await ethers.getContractFactory("BridgeManager");
    bridgeMgr = await BridgeCF.deploy();
    await bridgeMgr.waitForDeployment();

    const DiscountCF = await ethers.getContractFactory("NFTDiscount");
    discount = await DiscountCF.deploy();
    await discount.waitForDeployment();

    const TokenCF = await ethers.getContractFactory("IBITIcoin");
    token = await TokenCF.deploy(
      "IBITI", "IBI",
      owner.address,
      treasury.address,
      feeMgr.target,
      statusMgr.target,
      bridgeMgr.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await token.waitForDeployment();

    const StakingCF = await ethers.getContractFactory("StakingModule");
    staking = await StakingCF.deploy(token.target, discount.target);
    await staking.waitForDeployment();

    await token.connect(owner).setStakingModule(staking.target);

    await staking.connect(owner).setTreasury(treasury.address);
    await staking.connect(owner).setRewardConfig(1, 1, 1);
    await discount.connect(owner).setDAOModule(staking.target);

    const reserve = ethers.parseUnits("500", DECIMALS);
    await token.connect(owner).transfer(treasury.address, reserve);
    await token.connect(treasury).approve(staking.target, reserve);

    await token.connect(owner).transfer(user.address, ethers.parseUnits("50", DECIMALS));
  });

  it("mints exactly 1 NFT on early unstake under new logic", async function () {
    const stakeAmt = ethers.parseUnits("10", DECIMALS);
    await token.connect(user).approve(staking.target, stakeAmt);
    await token.connect(user).stakeTokens(stakeAmt, 1);

    const before = await discount.balanceOf(user.address);
    await ethers.provider.send("evm_increaseTime", [MONTH]);
    await ethers.provider.send("evm_mine");

    await token.connect(user).unstakeTokens();
    const after = await discount.balanceOf(user.address);

    expect(after - before).to.equal(1n);
  });

  it("resets stake amount to 0 after full unstake", async function () {
    const stakeAmt = ethers.parseUnits("10", DECIMALS);
    await token.connect(user).approve(staking.target, stakeAmt);
    await token.connect(user).stakeTokens(stakeAmt, 1);

    await ethers.provider.send("evm_increaseTime", [MONTH * 6]);
    await ethers.provider.send("evm_mine");

    await token.connect(user).unstakeTokens();
    const raw = await ethers.provider.getStorage(staking.target, ethers.solidityPackedKeccak256(["address", "uint256"], [user.address, 1]));
    expect(BigInt(raw)).to.equal(0n);
  });
});
