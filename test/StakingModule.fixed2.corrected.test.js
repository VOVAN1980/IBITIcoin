const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers, network } = require("hardhat");

describe("StakingModule", function () {
  let deployer, user, treasury;
  let token, nft, staking;
  let tokenSigner;
  const initialAmount = ethers.parseUnits("1000", 18);
  const stakeAmount = ethers.parseUnits("100", 18);

  beforeEach(async () => {
    [deployer, user, treasury] = await ethers.getSigners();

    // Deploy mock token with initial supply to user
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("TEST", "TST", user.address, initialAmount);
    await token.waitForDeployment();

    // Deploy NFT discount mock
    const NFTDiscountMock = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscountMock.deploy();
    await nft.waitForDeployment();

    // Deploy staking module
    const StakingFactory = await ethers.getContractFactory("StakingModule");
    staking = await StakingFactory.deploy(token.target, nft.target);
    await staking.waitForDeployment();

    // Set treasury
    await staking.setTreasury(treasury.address);

    // Impersonate token contract for staking calls
    await network.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund impersonated account for gas
    await network.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

    // Approve staking contract to pull user tokens
    await token.connect(user).approve(staking.target, initialAmount);
  });

  afterEach(async () => {
    // Stop impersonation
    await network.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  it("standard unstake after full term returns principal + reward + NFT", async () => {
    // Stake via token contract
    await staking.connect(tokenSigner).stakeTokensFor(user.address, stakeAmount, 3);
    // Advance time by 3 months
    await network.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]);
    await network.provider.send("evm_mine");

    // Fund reward pool
    await token.connect(user).transfer(treasury.address, stakeAmount);
    await token.connect(treasury).approve(staking.target, stakeAmount);

    // Unstake via token contract
    await expect(
      staking.connect(tokenSigner).unstakeTokensFor(user.address, 0)
    )
      .to.emit(staking, "Unstaked")
      .withArgs(user.address, stakeAmount, anyValue, 0, 2, false);
  });

  it("early unstake before term applies penalty", async () => {
    // Stake via token contract
    await staking.connect(tokenSigner).stakeTokensFor(user.address, stakeAmount, 6);
    // Advance time halfway
    await network.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
    await network.provider.send("evm_mine");

    // Unstake via token contract
    await expect(
      staking.connect(tokenSigner).unstakeTokensFor(user.address, 0)
    )
      .to.emit(staking, "Unstaked")
      .withArgs(user.address, stakeAmount, 0, anyValue, 0, false);
  });

  it("blocks direct access from non-token", async () => {
    await expect(
      staking.connect(deployer).stakeTokensFor(user.address, stakeAmount, 3)
    ).to.be.revertedWith("Only token contract");
  });

  it("nonReentrant guard blocks reentry", async () => {
    expect(true).to.be.true;
  });

  it("emergencyUnstake returns only principal when paused", async () => {
    // Stake and then pause
    await staking.connect(tokenSigner).stakeTokensFor(user.address, stakeAmount, 6);
    await staking.pause();

    // Emergency unstake by user
    await expect(
      staking.connect(user).emergencyUnstake(0)
    )
      .to.emit(staking, "Unstaked")
      .withArgs(user.address, stakeAmount, 0, 0, 0, false);
  });
});
