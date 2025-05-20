// test/nftdiscount.extra.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – updateNFT & Pandora/operator coverage", function () {
  let nft, owner, operator, user;

  beforeEach(async () => {
    [owner, operator, user] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // allow owner to mint via daoModule
    await nft.connect(owner).setDAOModule(owner.address);
    // set discountOperator
    await nft.connect(owner).setDiscountOperator(operator.address);
  });

  describe("updateNFT duplicate‑URI handling", function () {
    beforeEach(async () => {
      // mint a Normal NFT (tokenId = 0)
      await nft.connect(owner).mint(user.address, 1, "ipfs://original");
    });

    it("reverts when new URI already used", async () => {
      await expect(
        nft.connect(owner).updateNFT(0, "ipfs://original")
      ).to.be.revertedWith("New URI already used");
    });

    it("updates to a fresh URI and preserves purchaseTime", async () => {
      const before = await nft.discountData(0);
      const oldTs = before.purchaseTime;

      // warp 10 days
      await ethers.provider.send("evm_increaseTime", [10 * 24 * 3600]);
      await ethers.provider.send("evm_mine");

      const raw = "ipfs://newuri";
      const https = "https://dweb.link/ipfs/newuri";

      await expect(
        nft.connect(owner).updateNFT(0, raw)
      )
        .to.emit(nft, "NFTUpdated")
        .withArgs(0, 1, raw);

      // old token gone
      await expect(nft.ownerOf(0)).to.be.reverted;

      // new URI converted
      expect(await nft.tokenURI(1)).to.equal(https);

      const after = await nft.discountData(1);
      expect(after.purchaseTime).to.equal(oldTs);
      expect(after.discountPercent).to.equal(before.discountPercent);
    });
  });

  describe("Pandora & operator coverage", function () {
    let pandoraId;

    beforeEach(async () => {
      // mintPandora ⇒ nextTokenId increments to 1 so tokenId = 0
      await nft.connect(owner).mintPandora(user.address, "ipfs://pandora");
      const next = await nft.nextTokenId();            // BigInt under ethers v6
      pandoraId = next - 1n;                            // subtract 1 from BigInt
    });

    it("useDiscount on Pandora should revert with correct message", async () => {
      await expect(
        nft.connect(user).useDiscount(pandoraId)
      ).to.be.revertedWith("Use usePandora for Pandora");
    });

    it("usePandoraFor by operator increments usageCount and emits", async () => {
      await expect(
        nft.connect(operator).usePandoraFor(user.address, pandoraId)
      )
        .to.emit(nft, "NFTUsed")
        .withArgs(user.address, pandoraId, 100);

      const info = await nft.discountData(pandoraId);
      expect(info.usageCount).to.equal(1);
    });
  });
});
