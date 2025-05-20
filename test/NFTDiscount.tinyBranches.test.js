// test/NFTDiscount.tinyBranches.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – tiny uncovered branches", () => {
  let nft, owner;

  before(async () => {
    [owner] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
  });

  it("_convertToHttps keeps an https:// URI unchanged", async () => {
    const uri = "https://example.com/meta.json";
    await nft.mint(owner.address, 1, uri);      // tokenId = 0
    expect(await nft.tokenURI(0)).to.equal(uri); // строка 277
  });

  it("_levelFromDiscount reverts on unsupported %", async () => {
    await expect(
      nft.mint(owner.address, 2, "bad#pct")     // 2 % не поддерживается
    ).to.be.revertedWith("Invalid discount percent");        // строка 407
  });
});
