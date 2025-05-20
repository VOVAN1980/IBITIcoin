const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUniswapV2Pair Full", function() {
  let pair;
  const R0 = 500n, R1 = 2000n;

  beforeEach(async () => {
    const MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
    pair = await MockPair.deploy(R0, R1);
    await pair.waitForDeployment();
  });

  it("getReserves, factory and kLast", async () => {
    const [r0, r1, ts] = await pair.getReserves();
    expect(r0).to.equal(R0);
    expect(r1).to.equal(R1);
    expect(ts).to.equal(0n);

    expect(await pair.factory()).to.equal(ethers.ZeroAddress);
    expect(await pair.kLast()).to.equal(0n);
  });

  it("swap does not revert", async () => {
    await expect(pair.swap(1, 2, ethers.ZeroAddress, "0x")).to.not.be.reverted;
  });

  it("token0, token1, DOMAIN_SEPARATOR, MINIMUM_LIQUIDITY, PERMIT_TYPEHASH", async () => {
    expect(await pair.token0()).to.match(/^0x0+$/);
    expect(await pair.token1()).to.match(/^0x0+$/);
    expect(await pair.DOMAIN_SEPARATOR()).to.match(/^0x0+$/);
    expect(await pair.MINIMUM_LIQUIDITY()).to.equal(0n);
    expect(await pair.PERMIT_TYPEHASH()).to.match(/^0x0+$/);
  });

  it("ERC20-like methods: allowance, approve, balanceOf, burn", async () => {
    const [owner] = await ethers.getSigners();
    await expect(pair.allowance(owner.address, owner.address)).to.not.be.reverted;
    await expect(pair.approve(owner.address, 123)).to.not.be.reverted;
    await expect(pair.balanceOf(owner.address)).to.not.be.reverted;
    await expect(pair.burn(owner.address)).to.not.be.reverted;
  });

  it("decimals, initialize, mint, name, nonces, permit", async () => {
    const [owner] = await ethers.getSigners();

    expect(await pair.decimals()).to.equal(18);

    await expect(pair.initialize(ethers.ZeroAddress, ethers.ZeroAddress)).to.not.be.reverted;
    await expect(pair.mint(owner.address)).to.not.be.reverted;
    expect(await pair.name()).to.equal("MockUniswapV2Pair");
    await expect(pair.nonces(owner.address)).to.not.be.reverted;

    // v=0, r/s = ZeroHash
    await expect(
      pair.permit(owner.address, owner.address, 1, 0, 0, ethers.ZeroHash, ethers.ZeroHash)
    ).to.not.be.reverted;
  });

  it("price0CumulativeLast, price1CumulativeLast, skim, sync", async () => {
    expect(await pair.price0CumulativeLast()).to.equal(0n);
    expect(await pair.price1CumulativeLast()).to.equal(0n);

    const [, second] = await ethers.getSigners();
    await expect(pair.skim(second.address)).to.not.be.reverted;
    await expect(pair.sync()).to.not.be.reverted;
  });
});
