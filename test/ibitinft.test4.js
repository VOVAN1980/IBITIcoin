const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT – constructor revert", function () {
  it("reverts when IBITI token address is zero", async function () {
    const Factory = await ethers.getContractFactory("IBITINFT");
    await expect(
      Factory.deploy(
        "Name",
        "SYM",
        1000000,  // nftPrice
        1000000,  // nftPriceUSDT
        100,      // priceGrowthRate
        10,       // salesThreshold
        ethers.ZeroAddress
      )
    ).to.be.revertedWith("Invalid IBITI token");
  });
});
