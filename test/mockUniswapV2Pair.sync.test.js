const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUniswapV2Pair – coverage sync", function () {
  it("should call sync without reverting", async function () {
    const MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
    const pair = await MockPair.deploy(1000, 2000);
    await pair.waitForDeployment();

    await expect(pair.sync()).to.not.be.reverted;
  });
});
