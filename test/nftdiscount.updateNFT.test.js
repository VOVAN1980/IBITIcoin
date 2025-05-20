const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – updateNFT duplicate URI", function () {
  let owner, user, nft;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Настроим daoModule, чтобы mint работал
    await nft.connect(owner).setDAOModule(owner.address);

    // Отправим базовый URI
    await nft.connect(owner).mint(user.address, 1, "ipfs://original");
  });

  it("reverts updateNFT when new URI already used", async function () {
    await expect(
      nft.connect(owner).updateNFT(0, "ipfs://original")
    ).to.be.revertedWith("New URI already used");
  });

  it("successfully updates to a fresh URI", async function () {
    const oldPurchaseTime = (await nft.discountData(0)).purchaseTime;

    // We expect the event to carry the raw ipfs:// URI
    await expect(
      nft.connect(owner).updateNFT(0, "ipfs://newuri")
    )
      .to.emit(nft, "NFTUpdated")
      .withArgs(0, 1, "ipfs://newuri");

    // The old token is burned
    await expect(nft.ownerOf(0)).to.be.revertedWith("ERC721: invalid token ID");

    // But tokenURI() should return the converted HTTPS URL
    expect(await nft.tokenURI(1)).to.equal("https://dweb.link/ipfs/newuri");

    const data = await nft.discountData(1);
    expect(data.purchaseTime).to.equal(oldPurchaseTime);
  });
});
