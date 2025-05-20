const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolumeWeightedOracle – zero‑reserves edge case", function () {
  let oracle, mockPair;

  beforeEach(async () => {
    // Декimals для USD‑стейбла в пулах
    const decimals = 18;

    // Деплой оракула с нужными десятичными
    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(decimals);

    // Деплой мок-пула с нулевыми резервами
    const Pair = await ethers.getContractFactory("MockUniswapV2Pair");
    mockPair = await Pair.deploy(0, 0);

    // Добавляем пул в оракул
    await oracle.addPool(mockPair.target);
  });

  it("getPrice() should return 0 when all pools have zero reserves", async () => {
    const price = await oracle.getPrice();
    expect(price).to.equal(0);
  });
});
