const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolumeWeightedOracle", function() {
  let oracle, pair1, pair2, owner;

  beforeEach(async function() {
    [owner] = await ethers.getSigners();
    const OracleCF = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await OracleCF.deploy(8);
    await oracle.waitForDeployment();
  });

  it("should start with zero pools and price 0", async function() {
    expect(await oracle.poolCount()).to.equal(0n);
    expect(await oracle.getPrice()).to.equal(0n);
  });

  it("addPool should emit PoolAdded and increase count", async function() {
    const PairCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pair1 = await PairCF.deploy(5, 10);
    await pair1.waitForDeployment();
    await expect(oracle.addPool(pair1.target))
      .to.emit(oracle, "PoolAdded")
      .withArgs(pair1.target);
    expect(await oracle.poolCount()).to.equal(1n);
  });

  it("getPrice returns correct price for single pool", async function() {
    const PairCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pair1 = await PairCF.deploy(1000, 2000);
    await pair1.waitForDeployment();
    await oracle.addPool(pair1.target);
    await oracle.updatePrice();
    const price = await oracle.getPrice();
    expect(price).to.equal(2n * 10n ** 8n);
  });

  it("skips pools with zero reserves", async function() {
    const PairCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pair1 = await PairCF.deploy(0, 1000);
    await pair1.waitForDeployment();
    await oracle.addPool(pair1.target);
    await oracle.updatePrice();
    expect(await oracle.getPrice()).to.equal(0n);
  });

  it("calculates volume-weighted average for multiple pools", async function() {
    const PairCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pair1 = await PairCF.deploy(100, 2000);
    pair2 = await PairCF.deploy(200, 4000);
    await pair1.waitForDeployment();
    await pair2.waitForDeployment();
    await oracle.addPool(pair1.target);
    await oracle.addPool(pair2.target);
    await oracle.updatePrice();
    const price = await oracle.getPrice();
    expect(price).to.equal(20n * 10n ** 8n);
  });

  it("removePool should emit PoolRemoved and decrease count", async function() {
    const PairCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pair1 = await PairCF.deploy(1, 1);
    await pair1.waitForDeployment();
    await oracle.addPool(pair1.target);
    await expect(oracle.removePool(pair1.target))
      .to.emit(oracle, "PoolRemoved")
      .withArgs(pair1.target);
    expect(await oracle.poolCount()).to.equal(0n);
    await oracle.updatePrice();
    expect(await oracle.getPrice()).to.equal(0n);
  });
});
