const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("StakingModule", function () {
  let staking, token, nftDiscount;
  let owner, alice, treasury, outsider;
  let tokenSigner;
  const ONE_MONTH = 30n * 24n * 3600n;
  const GRACE     = 180n * 24n * 3600n;

  beforeEach(async () => {
    [owner, alice, treasury, outsider] = await ethers.getSigners();

    // Deploy token and give alice initial supply
    const ERC20Mock   = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "StakeToken",
      "STK",
      alice.address,
      ethers.parseUnits("1000", 8)
    );
    await token.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount       = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy StakingModule
    const Staking     = await ethers.getContractFactory("StakingModule");
    staking           = await Staking.deploy(token.target, nftDiscount.target);
    await staking.waitForDeployment();

    // Set treasury
    await staking.setTreasury(treasury.address);

    // Alice approves staking to pull tokens
    await token.connect(alice).approve(staking.target, ethers.parseUnits("500", 8));

    // Impersonate token contract for stake/unstake calls
    await network.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    await network.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);
  });

  afterEach(async () => {
    await network.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  it("rejects invalid stake calls", async () => {
    await expect(
      staking.connect(tokenSigner).stakeTokensFor(alice.address, 0, 3)
    ).to.be.revertedWith("Amount zero");
    await expect(
      staking.connect(tokenSigner).stakeTokensFor(alice.address, ethers.parseUnits("10", 8), 0)
    ).to.be.revertedWith("Invalid duration");
    await expect(
      staking.connect(tokenSigner).stakeTokensFor(alice.address, ethers.parseUnits("10", 8), 13)
    ).to.be.revertedWith("Invalid duration");
    await expect(
      staking.connect(outsider).stakeTokensFor(treasury.address, ethers.parseUnits("10", 8), 3)
    ).to.be.revertedWith("Only token contract");
  });

  it("allows valid staking and emits event", async () => {
    const amt = ethers.parseUnits("100", 8);
    await expect(
      staking.connect(tokenSigner).stakeTokensFor(alice.address, amt, 3)
    )
      .to.emit(staking, "Staked")
      .withArgs(alice.address, amt, 3);
    expect(await staking.totalStaked()).to.equal(amt);
    const info = await staking.stakes(alice.address, 0);
    expect(info.amount).to.equal(amt);
  });

  it("early unstake applies penalty", async () => {
    const amt = ethers.parseUnits("100", 8);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, amt, 3);
    const pct = await staking.getPenaltyPercentage(3);
    const penalty = (amt * pct) / 100n;
    await expect(
      staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0)
    )
      .to.emit(staking, "Unstaked")
      .withArgs(alice.address, amt, 0n, penalty, 0n, false);
    expect(await token.balanceOf(staking.target)).to.equal(penalty);
    expect(await token.balanceOf(treasury.address)).to.equal(0);
  });

  it("unstake within grace period gives reward and mints NFT", async () => {
    const amt = ethers.parseUnits("100", 8);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, amt, 1);
    await network.provider.send("evm_increaseTime", [Number(ONE_MONTH + 1n)]);
    await network.provider.send("evm_mine");
    const rewardPct = await staking.getRewardPercentage(1);
    const reward = (amt * rewardPct) / 100n;
    const cfg = await staking.rewardConfigs(1);
    await token.connect(alice).transfer(treasury.address, reward);
    await token.connect(treasury).approve(staking.target, reward);
    await expect(
      staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0)
    )
      .to.emit(staking, "Unstaked")
      .withArgs(alice.address, amt, reward, 0n, cfg.nftCount, false);
  });

  it("expired unstake sends principal to treasury", async () => {
    const amt = ethers.parseUnits("50", 8);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, amt, 1);
    const jump = ONE_MONTH + GRACE + 1n;
    await network.provider.send("evm_increaseTime", [Number(jump)]);
    await network.provider.send("evm_mine");
    await expect(
      staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0)
    )
      .to.emit(staking, "Unstaked")
      .withArgs(alice.address, amt, 0n, 0n, 0n, true);
    expect(await token.balanceOf(treasury.address)).to.equal(amt);
  });
});
