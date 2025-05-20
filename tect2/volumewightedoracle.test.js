// test/volumewightedoracle.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolumeWeightedOracle – zero totalWeight branch", function () {
  let oracle;
  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("VolumeWeightedOracle");
    // decimals = 6 (любое)
    oracle = await Factory.deploy(6);
    await oracle.waitForDeployment();
  });

  it("getPrice returns 0 when no pools configured", async function () {
    expect(await oracle.getPrice()).to.equal(0);
  });
});
