const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingModule Coverage Tests", function () {
  let token, nftDiscount, staking;
  let owner, user, treasury, stranger;
  let tokenSigner;

  beforeEach(async function () {
    [owner, user, treasury, stranger] = await ethers.getSigners();

    // Deploy mock token
    const Token = await ethers.getContractFactory("ERC20MintableMock");
    token = await Token.deploy("Mock Token", "MTKN");
    await token.mint(owner.address, ethers.parseUnits("1000000", 8));

    // Deploy mock NFT
    const NFTMock = await ethers.getContractFactory("MockNFTDiscount");
    nftDiscount = await NFTMock.deploy();

    // Deploy staking module
    const StakingModule = await ethers.getContractFactory("StakingModule");
    staking = await StakingModule.deploy(token.target, nftDiscount.target);

    // Set treasury
    await staking.setTreasury(treasury.address);

    // Impersonate token contract address for staking calls
    await ethers.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund impersonated account for gas
    await ethers.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

    // Approve and stake tokens
    await token.connect(owner).approve(staking.target, ethers.MaxUint256);
    await staking.connect(tokenSigner).stakeTokensFor(owner.address, ethers.parseUnits("1000", 8), 1);
  });

  afterEach(async function () {
    // Stop impersonation
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  it("should apply penalty on early unstake [line 297]", async function () {
    await time.increase(3600); // 1 hour
    await staking.connect(tokenSigner).unstakeTokensFor(owner.address, 0);
    const contractBal = await token.balanceOf(staking.target);
    expect(contractBal).to.be.gt(0);
  });

  it("should reward on timely unstake and mint NFT [line 305]", async function () {
    // Increase time > 1 month
    await time.increase(31 * 24 * 60 * 60);
    // Provide tokens for reward
    await token.mint(treasury.address, ethers.parseUnits("10000", 8));
    await token.connect(treasury).approve(staking.target, ethers.MaxUint256);
    // Unstake
    await staking.connect(tokenSigner).unstakeTokensFor(owner.address, 0);
    expect(await token.balanceOf(staking.target)).to.equal(0);
  });

  it("should send all to treasury on overdue unstake [line 323]", async function () {
    await time.increase(210 * 24 * 60 * 60);
    const before = await token.balanceOf(treasury.address);
    await staking.connect(tokenSigner).unstakeTokensFor(owner.address, 0);
    const after = await token.balanceOf(treasury.address);
    expect(after).to.be.gt(before);
  });

  it("should skim excess to treasury", async function () {
    await time.increase(3600);
    await staking.connect(tokenSigner).unstakeTokensFor(owner.address, 0);

    const totalStaked = await staking.totalStaked();
    const currentBalance = await token.balanceOf(staking.target);
    const excess = currentBalance - totalStaked;

    const before = await token.balanceOf(treasury.address);
    await staking.connect(owner).skimExcessToTreasury(excess);
    const after = await token.balanceOf(treasury.address);
    expect(after).to.be.gt(before);
  });

  it("should rescue tokens except core staking token", async function () {
    const ERC20 = await ethers.getContractFactory("ERC20MintableMock");
    const otherToken = await ERC20.deploy("RescueMe", "RSQ");
    await otherToken.mint(staking.target, ethers.parseUnits("123", 8));

    const before = await otherToken.balanceOf(owner.address);
    await staking.connect(owner).rescueTokens(otherToken.target, owner.address, ethers.parseUnits("100", 8));
    const after = await otherToken.balanceOf(owner.address);
    expect(after - before).to.equal(ethers.parseUnits("100", 8));
  });

  it("should revert if trying to rescue core token", async function () {
    await expect(
      staking.connect(owner).rescueTokens(token.target, owner.address, ethers.parseUnits("1", 8))
    ).to.be.revertedWith("Use skimExcess");
  });

  it("should revert stakeTokensFor when called by non-token", async function () {
    await expect(
      staking.connect(stranger).stakeTokensFor(user.address, ethers.parseUnits("1", 8), 1)
    ).to.be.revertedWith("Only token contract");
  });
});
