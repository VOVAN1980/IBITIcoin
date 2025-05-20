const { expect } = require("chai");
const { ethers, network }  = require("hardhat");
const { parseUnits } = ethers;

describe("StakingModule: full-coverage", function () {
  let token, nft, staking, tokenSigner;
  let owner, treasury, alice;
  const DEC   = 8;                         // токен имеет 8 dec
  const MONTH = 30 * 24 * 60 * 60;         // 30 дней
  const GRACE = 180 * 24 * 60 * 60;        // 180 дней

  beforeEach(async () => {
    [owner, treasury, alice] = await ethers.getSigners();

    // Deploy ERC20Mock (8 dec)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const initial   = parseUnits("2000000", DEC);
    token = await ERC20Mock.deploy("IBI","IBI", owner.address, initial);
    await token.waitForDeployment();

    // Distribute balances
    await token.transfer(treasury.address, parseUnits("1000000", DEC));
    await token.transfer(alice.address,    parseUnits("1000",    DEC));

    // Deploy NFTDiscount and StakingModule
    nft      = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await nft.waitForDeployment();
    staking = await (await ethers.getContractFactory("StakingModule")).deploy(token.target, nft.target);
    await staking.waitForDeployment();

    // Configure treasury and DAO module
    await staking.setTreasury(treasury.address);
    await nft.setDAOModule(staking.target);

    // Fund treasury for reward payouts
    await token.connect(owner).transfer(treasury.address, parseUnits("1000", DEC));
    await token.connect(treasury).approve(staking.target, parseUnits("1000", DEC));

    // Approve staking from Alice
    await token.connect(alice).approve(staking.target, parseUnits("1000000", DEC));

    // Impersonate token contract to call stake/unstake
    await network.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund impersonated account for gas
    await network.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);
  });

  afterEach(async () => {
    await network.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  // Helper to warp time
  async function warp(sec) {
    await network.provider.send("evm_increaseTime", [sec]);
    await network.provider.send("evm_mine");
  }

  it("on-time claim (<= grace): principal + reward + 2 NFT", async () => {
    const principal = parseUnits("100", DEC);
    // Stake as token contract
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, principal, 3);
    // Warp 4 months (< grace)
    await warp(4 * MONTH);

    const before = await token.balanceOf(alice.address);
    await staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0);
    const after  = await token.balanceOf(alice.address);

    const reward = principal * 5n / 100n; // 5% for 3-month stake
    expect(after - before).to.equal(principal + reward);
    // Should mint 2 Jackpot-NFTs (enum 5)
    expect(await nft.mintedCount(5)).to.equal(2);
  });

  it("expired claim (> grace): confiscation to treasury", async () => {
    const principal = parseUnits("50", DEC);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, principal, 1);
    await warp(MONTH + GRACE + 24 * 60 * 60);

    const tBefore = await token.balanceOf(treasury.address);
    const aBefore = await token.balanceOf(alice.address);

    await staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0);

    const tAfter = await token.balanceOf(treasury.address);
    const aAfter = await token.balanceOf(alice.address);

    expect(tAfter - tBefore).to.equal(principal);
    expect(aAfter).to.equal(aBefore);
  });

  it("early unstake (< term): 10% penalty applies", async () => {
    const principal = parseUnits("200", DEC);
    await staking.connect(tokenSigner).stakeTokensFor(alice.address, principal, 5);
    await warp(MONTH);

    const aBefore = await token.balanceOf(alice.address);
    await staking.connect(tokenSigner).unstakeTokensFor(alice.address, 0);
    const aAfter  = await token.balanceOf(alice.address);

    const penalty = principal * 10n / 100n;
    expect(aAfter - aBefore).to.equal(principal - penalty);
  });
});