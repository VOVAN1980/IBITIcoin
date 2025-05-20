const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("New NFTDiscount Tests", function () {
  let nftDiscount, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Нужен любой авторизованный минтер, чтобы mint() работал
    await nftDiscount.connect(owner).setDAOModule(owner.address);
  });

  it("should mint regular NFT and burn it after use", async () => {
    await nftDiscount.connect(owner).mint(user.address, 1, "ipfs://uri1");
    const tokenId = 0;

    expect(await nftDiscount.balanceOf(user.address)).to.equal(1);

    await nftDiscount.connect(user).useDiscount(tokenId);

    expect(await nftDiscount.balanceOf(user.address)).to.equal(0);
    await expect(nftDiscount.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID");
  });

  it("should allow using Pandora NFT 10 times then block", async () => {
    await nftDiscount.connect(owner).mintPandora(user.address, "ipfs://pandora1");
    const tokenId = 0;

    for (let i = 0; i < 10; i++) {
      await nftDiscount.connect(user).usePandora(tokenId);
    }

    await expect(nftDiscount.connect(user).usePandora(tokenId))
      .to.be.revertedWith("Usage limit reached");
  });

  it("should reset Pandora usage after 360 days (by successful reuse)", async () => {
    await nftDiscount.connect(owner).mintPandora(user.address, "ipfs://pandora2");
    const tokenId = 0;

    for (let i = 0; i < 10; i++) {
      await nftDiscount.connect(user).usePandora(tokenId);
    }

    const days360 = 360 * 24 * 3600;
    await ethers.provider.send("evm_increaseTime", [days360]);
    await ethers.provider.send("evm_mine");

    // Сброс использования, теперь снова можно
    await expect(nftDiscount.connect(user).usePandora(tokenId))
      .to.not.be.reverted;
  });

  it("should allow transfer of regular NFT immediately (cooldown disabled)", async () => {
    await nftDiscount.connect(owner).mint(user.address, 1, "ipfs://uri2");
    const tokenId = 0;

    // Поскольку кулдаун = 0, передача должна пройти без revert
    await nftDiscount.connect(user).transferFrom(user.address, owner.address, tokenId);
    expect(await nftDiscount.ownerOf(tokenId)).to.equal(owner.address);
  });

  it("should burn regular NFT after 30 days (via useDiscount)", async () => {
    await nftDiscount.connect(owner).mint(user.address, 1, "ipfs://uri3");
    const tokenId = 0;

    const days30 = 30 * 24 * 3600;
    await ethers.provider.send("evm_increaseTime", [days30]);
    await ethers.provider.send("evm_mine");

    // Ожидаем, что expired-NFT не пропустит вызов: revert с вашим сообщением
    await expect(nftDiscount.connect(user).useDiscount(tokenId))
      .to.be.revertedWith("Discount NFT expired");

    // После revert NFT остаётся на месте
    expect(await nftDiscount.ownerOf(tokenId)).to.equal(user.address);
    expect(await nftDiscount.balanceOf(user.address)).to.equal(1);
  });
});
