const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUniswapV2Pair – full API coverage", function () {
  let owner, other;
  let token0, token1, pair;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy two ERC20Mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token0 = await ERC20Mock.deploy("Token0", "T0", owner.address, 1_000);
    await token0.waitForDeployment();
    token1 = await ERC20Mock.deploy("Token1", "T1", owner.address, 2_000);
    await token1.waitForDeployment();

    // Deploy the pair, passing initial reserves
    const Pair = await ethers.getContractFactory("MockUniswapV2Pair");
    pair = await Pair.deploy(100 /*reserve0_*/, 200 /*reserve1_*/);
    await pair.waitForDeployment();

    // Initialize and seed token balances
    await pair.initialize(token0.target, token1.target);
    await token0.transfer(pair.target, 1_000);
    await token1.transfer(pair.target, 2_000);
  });

  it("returns correct reserves", async function () {
    const [r0, r1, ts] = await pair.getReserves();
    expect(r0).to.equal(100);
    expect(r1).to.equal(200);
    expect(ts).to.equal(0);
  });

  it("exposes all getters", async function () {
    expect(await pair.factory()).to.equal(ethers.ZeroAddress);
    expect(await pair.kLast()).to.equal(0);
    expect(await pair.token0()).to.equal(ethers.ZeroAddress);
    expect(await pair.token1()).to.equal(ethers.ZeroAddress);
    expect(await pair.name()).to.equal("MockUniswapV2Pair");
    expect(await pair.symbol()).to.equal("MUP");
    expect(await pair.decimals()).to.equal(18);
    expect(await pair.DOMAIN_SEPARATOR()).to.equal(ethers.ZeroHash);
    expect(await pair.MINIMUM_LIQUIDITY()).to.equal(0);
    expect(await pair.PERMIT_TYPEHASH()).to.equal(ethers.ZeroHash);
    expect(await pair.price0CumulativeLast()).to.equal(0);
    expect(await pair.price1CumulativeLast()).to.equal(0);
  });

  it("supports swap, mint, burn, skim, sync and ERC‑20–like methods", async function () {
    await expect(pair.swap(10, 20, other.address, "0x")).to.not.be.reverted;
    await expect(pair.mint(other.address)).to.not.be.reverted;
    await expect(pair.burn(other.address)).to.not.be.reverted;
    await expect(pair.skim(other.address)).to.not.be.reverted;
    await expect(pair.sync()).to.not.be.reverted;

    // ERC‑20–like
    expect(await pair.allowance(owner.address, other.address)).to.equal(0);
    await pair.approve(other.address, 50);
    await pair.transfer(other.address, 25);
    await pair.transferFrom(owner.address, other.address, 10);
    await pair.nonces(owner.address);

    // permit stub (no-real-signature)
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await expect(
      pair.permit(
        owner.address,
        other.address,
        0, deadline,
        0, ethers.ZeroHash, ethers.ZeroHash
      )
    ).to.not.be.reverted;
  });
});
