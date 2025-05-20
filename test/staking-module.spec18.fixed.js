const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("StakingModule - stake/unstake behavior", function () {
  const DECIMALS = 18;
  const MONTH    = 30 * 24 * 60 * 60;       // 1 месяц
  const GRACE    = 180 * 24 * 60 * 60;      // 180 дней

  let owner, user, treasury;
  let token, nft, staking, tokenSigner;

  beforeEach(async () => {
    [owner, user, treasury] = await ethers.getSigners();

    // Deploy mock token
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "MockToken",
      "MTK",
      owner.address,
      ethers.parseUnits("1000000", DECIMALS)
    );
    await token.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Deploy StakingModule
    const StakingModule = await ethers.getContractFactory("StakingModule");
    staking = await StakingModule.deploy(token.target, nft.target);
    await staking.waitForDeployment();

    // Configure NFTDiscount DAO module
    await nft.connect(owner).setDAOModule(staking.target);

    // Set reward configurations
    await staking.setRewardConfig(3, 2, 5);
    await staking.setRewardConfig(6, 3, 10);

    // Set treasury
    await staking.setTreasury(treasury.address);

    // Distribute tokens
    await token.transfer(user.address, ethers.parseUnits("1000", DECIMALS));
    await token.transfer(treasury.address, ethers.parseUnits("1000", DECIMALS));

    // Approve staking contract to pull user tokens
    await token.connect(user).approve(staking.target, ethers.parseUnits("1000", DECIMALS));

    // Impersonate token contract for stake/unstake calls
    await network.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund impersonated token for gas
    await network.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);
  });

  afterEach(async () => {
    // Stop impersonation
    await network.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  it("should charge penalty and return reduced amount when unstaked early", async () => {
    const amount = ethers.parseUnits("100", DECIMALS);

    // Stake 100 tokens for 6 months via token contract
    await staking.connect(tokenSigner).stakeTokensFor(user.address, amount, 6);

    // Fast‐forward 1 month (early unstake)
    await network.provider.send("evm_increaseTime", [MONTH]);
    await network.provider.send("evm_mine");

    // Calculate 12% penalty and fund contract
    const penalty       = amount * 12n / 100n;   // 12 tokens
    const fundingAmount = amount + penalty;     // 112 tokens
    await token.transfer(staking.target, fundingAmount);

    // Save balances
    const balUserBefore     = await token.balanceOf(user.address);
    const balTreasuryBefore = await token.balanceOf(treasury.address);

    // Unstake via token contract
    await staking.connect(tokenSigner).unstakeTokensFor(user.address, 0);

    // Assert user balance increased by amount - penalty
    const balUserAfter     = await token.balanceOf(user.address);
    expect(balUserAfter - balUserBefore).to.equal(amount - penalty);

    // Assert treasury unchanged
    const balTreasuryAfter = await token.balanceOf(treasury.address);
    expect(balTreasuryAfter).to.equal(balTreasuryBefore);
  });

  it("should mint NFTs and apply reward when unstaked during grace period", async () => {
    const amount = ethers.parseUnits("100", DECIMALS);

    // Stake 100 tokens for 3 months
    await staking.connect(tokenSigner).stakeTokensFor(user.address, amount, 3);

    // Advance time 3 months + 60 sec
    await network.provider.send("evm_increaseTime", [3 * MONTH + 60]);
    await network.provider.send("evm_mine");

    // Fund payout = principal + 5%
    const totalReturn = amount + (amount * 5n / 100n);
    await token.transfer(staking.target, totalReturn);

    const balBefore = await token.balanceOf(user.address);
    // Unstake
    await staking.connect(tokenSigner).unstakeTokensFor(user.address, 0);
    const balAfter  = await token.balanceOf(user.address);

    // Check payout
    const expectedReward = amount * 5n / 100n;
    expect(balAfter - balBefore).to.equal(amount + expectedReward);
    // Two NFTs minted
    expect(await nft.balanceOf(user.address)).to.equal(2);
  });

  it("should send all to treasury if unstaked after grace period", async () => {
    const amount = ethers.parseUnits("100", DECIMALS);

    // Stake
    await staking.connect(tokenSigner).stakeTokensFor(user.address, amount, 3);

    // Advance past term + grace
    await network.provider.send("evm_increaseTime", [3 * MONTH + GRACE + 1]);
    await network.provider.send("evm_mine");

    const balUserBefore  = await token.balanceOf(user.address);
    const balTreasBefore = await token.balanceOf(treasury.address);

    // Unstake
    await staking.connect(tokenSigner).unstakeTokensFor(user.address, 0);

    const balUserAfter   = await token.balanceOf(user.address);
    const balTreasAfter  = await token.balanceOf(treasury.address);

    expect(balUserAfter - balUserBefore).to.equal(0n);
    expect(balTreasAfter - balTreasBefore).to.equal(amount);
  });

  it("should revert when staking with invalid duration", async () => {
    const amount = ethers.parseUnits("100", DECIMALS);

    // Attempt invalid duration
    await expect(
      staking.connect(tokenSigner).stakeTokensFor(user.address, amount, 13)
    ).to.be.revertedWith("Invalid duration");
  });
});
