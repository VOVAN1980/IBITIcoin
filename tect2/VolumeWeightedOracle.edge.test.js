const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolumeWeightedOracle – edge case (line 69: return 0)", () => {
  let oracle;

  beforeEach(async () => {
    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(8); // decimals = 8
  });

  it("should return 0 if all pools have zero reserves (line 69)", async () => {
    // 👇 Создаём пул с нулевыми резервами
    const MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
    const pool = await MockPair.deploy(0, 0); // reserve0, reserve1 = 0

    await oracle.addPool(pool.target);
    const price = await oracle.getPrice();
    expect(price).to.equal(0); // 🟢 должна вернуть 0
  });
});
