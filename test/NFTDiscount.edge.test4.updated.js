const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – edge coverage (276, 277, 341)", () => {
  let nft, owner, alice;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("NFTDiscount");
    nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.setDiscountOperator(owner.address);
  });

  it("should revert on expired NFT via useDiscount (lines 276–277)", async () => {
    const uri = "ipfs://expired-uri";
    await nft.mint(alice.address, 1, uri);
    const tokenId = 0;

    // fast-forward > 30 days
    const block = await ethers.provider.getBlock("latest");
    const expiredTime = block.timestamp + 31 * 24 * 60 * 60;
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiredTime]);
    await ethers.provider.send("evm_mine");

    // useDiscount should revert with expiration message
    await expect(nft.connect(alice).useDiscount(tokenId))
      .to.be.revertedWith("Discount NFT expired");

    // Token should still be present, owner remains alice
    expect(await nft.ownerOf(tokenId)).to.equal(alice.address);
  });

  it("should revert on duplicate URI in awardVotingRewards (line 341)", async () => {
    const uri = "baseURI://meta/";
    const winner = [owner.address];
    const loser = [];

    // first issuance should pass
    await nft.awardVotingRewards(winner, loser, uri);

    // fast-forward 31 days
    const blockNow = await ethers.provider.getBlock("latest");
    const futureTime = blockNow.timestamp + 31 * 24 * 60 * 60;
    await ethers.provider.send("evm_setNextBlockTimestamp", [futureTime]);
    await ethers.provider.send("evm_mine");

    // second call should revert on duplicate URI
    await expect(nft.awardVotingRewards(winner, loser, uri))
      .to.be.revertedWith("URI already used");
  });
});
