const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – core functionality and edge cases", function () {
  let nft, owner, alice;
  const uri1 = "ipfs://uri1";
  const uri2 = "ipfs://uri2";

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();
  });

  it("URI uniqueness enforced even across different users", async () => {
    await nft.mint(owner.address, 1, uri1);

    await expect(
      nft.mint(alice.address, 5, uri1)
    ).to.be.revertedWith("URI already used");

    await nft.mint(alice.address, 5, uri2);
  });
});