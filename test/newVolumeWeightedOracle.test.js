const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolumeWeightedOracle Tests", function() {
  let oracle, mockPair;
  let owner;
  const decimalsOracle = 8;

  beforeEach(async function() {
    [owner] = await ethers.getSigners();
    const VolumeWeightedOracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await VolumeWeightedOracle.deploy(decimalsOracle);
    await oracle.waitForDeployment();

    const MockUniswapV2Pair = await ethers.getContractFactory("MockUniswapV2Pair");
    mockPair = await MockUniswapV2Pair.deploy(1000, 2000);
    await mockPair.waitForDeployment();

    await oracle.connect(owner).addPool(mockPair.target);
    await oracle.updatePrice();
  });

  it("should compute price correctly", async function() {
    const price = await oracle.getPrice();
    expect(price).to.equal(2n * 10n ** 8n);
  });

  it("should remove pool and update index", async function() {
    await oracle.connect(owner).removePool(mockPair.target);
    const price = await oracle.getPrice();
    expect(price).to.equal(0n);
  });
});
