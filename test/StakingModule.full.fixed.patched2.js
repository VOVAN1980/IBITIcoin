const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { parseUnits } = ethers;

describe("StakingModule: full‑coverage", function () {
  let token, nft, staking, tokenSigner;
  let owner, treasury, alice;
  const DEC   = 8;                         // токен имеет 8 dec
  const MONTH = 30 * 24 * 60 * 60;         // 30 дней
  const GRACE = 180 * 24 * 60 * 60;        // 180 дней

  beforeEach(async () => {
    [owner, treasury, alice] = await ethers.getSigners();

    // Deploy ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("IBI", "IBI", owner.address, parseUnits("2000000", DEC));
    await token.waitForDeployment();
    // Distribute balances
    await token.transfer(treasury.address, parseUnits("1000", DEC));
    await token.transfer(alice.address,    parseUnits("1000", DEC));

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Deploy StakingModule
    const StakingModule = await ethers.getContractFactory("StakingModule");
    staking = await StakingModule.deploy(token.target, nft.target);
    await staking.waitForDeployment();

    // Configure treasury and DAO module
    await staking.setTreasury(treasury.address);
    await nft.setDAOModule(staking.target);

    // Fund treasury for reward payouts
    await token.connect(owner).transfer(treasury.address, parseUnits("1000", DEC));
    await token.connect(treasury).approve(staking.target, parseUnits("1000000", DEC));

    // Impersonate token contract to call stakeTokensFor
    await network.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund impersonated account for gas
    await network.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

    // Approve staking from alice
    await token.connect(alice).approve(staking.target, parseUnits("1000000", DEC));
  });

  afterEach(async () => {
    // Stop impersonation
    await network.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  // Helper to warp time
  async function warp(sec) {
    await network.provider.send("evm_increaseTime", [sec]);
    await network.provider.send("evm_mine");
  }

  it("on‑time claim (<= grace): principal + reward + 2 NFT", async () => {
    const principal = parseUnits("100", DEC);
    // Stake via token contract
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, principal, 3);
    // Advance time: 3 months + 1 month = 4 * MONTH (< grace)
    await warp(4 * MONTH);

    const before = await token.balanceOf(alice.address);
    await staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0);
    const after = await token.balanceOf(alice.address);

    const reward = principal * 5n / 100n; // 5% for 3-month stake
    expect(after - before).to.equal(principal + reward);
    // Jackpot-NFT enum 5, 2 items
    expect(await nft.mintedCount(5)).to.equal(2);
  });

  it("expired claim (> grace): confiscation to treasury", async () => {
    const principal = parseUnits("50", DEC);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, principal, 1);
    // Advance past term + grace
    await warp(MONTH + GRACE + 24 * 60 * 60);

    const tBefore = await token.balanceOf(treasury.address);
    const aBefore = await token.balanceOf(alice.address);

    await staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0);

    const tAfter = await token.balanceOf(treasury.address);
    const aAfter = await token.balanceOf(alice.address);

    expect(tAfter - tBefore).to.equal(principal);
    expect(aAfter).to.equal(aBefore);
  });

  it("early unstake (< term): 10% penalty", async () => {
    const principal = parseUnits("200", DEC);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, principal, 5);
    // Advance 1 month
    await warp(MONTH);

    const beforeBal = await token.balanceOf(alice.address);
    await staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0);
    const afterBal  = await token.balanceOf(alice.address);

    const penalty = principal * 10n / 100n;
    expect(afterBal - beforeBal).to.equal(principal - penalty);
  });
});
