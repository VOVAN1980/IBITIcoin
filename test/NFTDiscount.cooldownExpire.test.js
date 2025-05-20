const { expect } = require("chai");
const { ethers }  = require("hardhat");

const DAY  = 24 * 60 * 60;
const YEAR = 365 * DAY;

describe("NFTDiscount – cooldown disabled for Pandora, Epic auto‑burn after year", function () {
  let nft, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();
  });

  it("Pandora можно передать сразу (cooldown disabled)", async function () {
    await nft.connect(owner).mintPandora(alice.address, "ipfs://pan#1"); 
    await nft.connect(alice).transferFrom(alice.address, bob.address, 0);
    expect(await nft.ownerOf(0)).to.equal(bob.address);
  });

  it("Epic auto‑burns после 1 года", async function () {
    // Mint Epic (50%) as owner
    await nft.connect(owner).mint(alice.address, 50, "ipfs://epic#1"); // tokenId = 1

    // Fast-forward > 1 year
    await ethers.provider.send("evm_increaseTime", [YEAR + DAY]);
    await ethers.provider.send("evm_mine");

    // Now useDiscount should revert because token was auto‑burned
    await expect(
      nft.connect(alice).useDiscount(1)
    ).to.be.revertedWith("ERC721: invalid token ID");
  });
});
