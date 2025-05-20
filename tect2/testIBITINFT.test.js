const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT", function () {
  let ibitiNFT, ibitiToken;
  let owner, user1;
  const baseURI = "ipfs://sample-uri";

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    const IBITIToken = await ethers.getContractFactory("ERC20Mock");
    ibitiToken = await IBITIToken.deploy("IBITI", "IBI", owner.address, ethers.parseEther("1000000"));

    const IBITINFT = await ethers.getContractFactory("IBITINFT");
    ibitiNFT = await IBITINFT.deploy(
      "IBITI NFT",
      "IBINFT",
      ethers.parseEther("10"),
      ethers.parseUnits("10", 6),
      500,
      5,
      ibitiToken.target
    );

    // Approve and fund user1
    await ibitiToken.transfer(user1.address, ethers.parseEther("100"));
    await ibitiToken.connect(user1).approve(ibitiNFT.target, ethers.parseEther("10"));
  });

  it("should mint an NFT to user1", async function () {
    await expect(ibitiNFT.connect(user1).purchaseNFT(baseURI))
      .to.emit(ibitiNFT, "NFTPurchased")
      .withArgs(user1.address, 0, ethers.parseEther("10"), ibitiToken.target);

    expect(await ibitiNFT.ownerOf(0)).to.equal(user1.address);
  });
});
