const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockPriceFeed Tests", function() {
  let priceFeed;
  let owner;

  beforeEach(async function() {
    [owner] = await ethers.getSigners();
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    // Устанавливаем начальную цену, например 2000 * 10^8 (2000 с 8 десятичными)
    priceFeed = await MockPriceFeed.deploy(2000 * 10**8);
    await priceFeed.waitForDeployment();
  });

  it("should return correct decimals, description, version, and latestRoundData", async function() {
    expect(await priceFeed.decimals()).to.equal(8);
    expect(await priceFeed.description()).to.equal("Mock Price Feed");
    expect(await priceFeed.version()).to.equal(1);
    const roundData = await priceFeed.latestRoundData();
    expect(roundData.answer).to.equal(2000 * 10**8);
  });
});
