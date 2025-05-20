// test/NFTDiscount.test7.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – core functionality and edge cases", function () {
  let nft;
  let owner, alice, bob;
  const sampleURI = "ipfs://QmSample";
  const newURI = "ipfs://QmNewSample";

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();
  });

  it("only owner can mint standard NFT and URI uniqueness enforced", async function () {
    await expect(nft.connect(alice).mint(alice.address, 1, sampleURI))
      .to.be.revertedWith("Not authorized");

    await expect(nft.connect(owner).mint(alice.address, 1, sampleURI))
      .to.emit(nft, "NFTMinted");

    await expect(nft.connect(owner).mint(alice.address, 1, sampleURI))
      .to.be.revertedWith("URI already used");
  });

  it("respects supply cap and monthly mint limit for a level", async function () {
    // Temporarily set supply cap for Normal to 1
    await nft.connect(owner).setSupplyCap(0 /* Normal */, 1);
    // First mint works
    await nft.connect(owner).mint(alice.address, 1, "ipfs://A");
    // Second mint reverts
    await expect(
      nft.connect(owner).mint(bob.address, 1, "ipfs://B")
    ).to.be.revertedWith("Supply cap reached");

    // Test monthly limit: reset cap and set monthlyLimit to 1
    await nft.connect(owner).setSupplyCap(0, 10);
    await nft.connect(owner).setMonthlyLimit(0, 1);
    // Alice already has one minted this month
    await expect(
      nft.connect(owner).mint(alice.address, 1, "ipfs://C")
    ).to.be.revertedWith("Monthly mint limit reached");
  });

  it("useDiscount burns NFT and emits NFTUsed, and expired NFT auto-burns", async function () {
    // Mint a Legendary (10%) for Alice
    await nft.connect(owner).mint(alice.address, 10, sampleURI);
    const tokenId = 0;

    // Using before expire
    await expect(nft.connect(alice).useDiscount(tokenId))
      .to.emit(nft, "NFTUsed");
    // Token burned, ownerOf should revert
    await expect(nft.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID");

    // Mint Normal (1%) and fast-forward past expiration
    await nft.connect(owner).mint(alice.address, 1, "ipfs://E");
    const expId = 1;
    // 31 days later
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine");

    // Expired: expect revert with expiration message
    await expect(
      nft.connect(alice).useDiscount(expId)
    ).to.be.revertedWith("Discount NFT expired");
  });

  it("mintPandora allows max 10 uses per 360 days and resets after period", async function () {
    await expect(nft.connect(owner).mintPandora(alice.address, sampleURI))
      .to.emit(nft, "NFTMintedPandora");
    const pid = 0;
    // 10 uses
    for (let i = 0; i < 10; i++) {
      await expect(nft.connect(alice).usePandora(pid))
        .to.emit(nft, "NFTUsed");
    }
    // 11th use reverts
    await expect(nft.connect(alice).usePandora(pid))
      .to.be.revertedWith("Usage limit reached");

    // Fast-forward 361 days to reset
    await ethers.provider.send("evm_increaseTime", [361 * 24 * 3600]);
    await ethers.provider.send("evm_mine");
    // Now counter reset: should succeed again
    await expect(nft.connect(alice).usePandora(pid))
      .to.emit(nft, "NFTUsed");
  });

  it("transfer restrictions: disabled cooldowns and non-transferable Jackpot", async function () {
    // Mint Rare (5%) to Alice
    await nft.connect(owner).mint(alice.address, 5, sampleURI);
    const rid = 0;
    // Transfer to Bob
    await nft.connect(alice).transferFrom(alice.address, bob.address, rid);
    // Immediate second transfer now succeeds (cooldown disabled)
    await nft.connect(bob).transferFrom(bob.address, alice.address, rid);

    // Fast-forward 1 day and still transferrable
    await ethers.provider.send("evm_increaseTime", [1 * 24 * 3600]);
    await ethers.provider.send("evm_mine");
    await nft.connect(alice).transferFrom(alice.address, bob.address, rid);

    // Mint Jackpot (3%) and try transfer
    await nft.connect(owner).mintJackpot(alice.address, 3, "ipfs://J");
    const jid = 1;
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, jid)
    ).to.be.revertedWith("Jackpot NFTs are non-transferable");
  });

  it("updateNFT burns old and mints new preserving purchaseTime", async function () {
    // Mint Legendary
    await nft.connect(owner).mint(alice.address, 15, sampleURI);
    const oid = 0;
    const orig = await nft.discountData(oid);
    // Wait a bit then update
    await ethers.provider.send("evm_increaseTime", [1]);
    await ethers.provider.send("evm_mine");
    await nft.connect(owner).updateNFT(oid, newURI);
    // New token id = 1
    const data = await nft.discountData(1);
    expect(data.purchaseTime).to.equal(orig.purchaseTime);
  });
});
