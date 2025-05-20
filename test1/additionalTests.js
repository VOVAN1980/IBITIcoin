const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const ZERO = "0x0000000000000000000000000000000000000000";

describe("NFTDiscount Edge Cases", function () {
  let nftDiscount, owner, alice, bob, other;

  beforeEach(async function () {
    [owner, alice, bob, other] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Назначаем DAO‑модуль для mint и mintJackpot
    await nftDiscount.setDAOModule(owner.address);
  });

  it("should revert minting NFT with duplicate URI", async function () {
    await nftDiscount.mint(owner.address, 3, "ipfs://uniqueURI");
    await expect(
      nftDiscount.mint(owner.address, 3, "ipfs://uniqueURI")
    ).to.be.revertedWith("URI already used");
  });

  it("should allow using Pandora NFT 10 times then block", async function () {
    const tx = await nftDiscount.mintPandora(alice.address, "ipfs://pandora");
    const receipt = await tx.wait();
    const tokenId = receipt.logs.find(l => l.eventName === "Transfer" && l.args.from === ZERO).args.tokenId;

    for (let i = 0; i < 10; i++) {
      await expect(nftDiscount.connect(alice).usePandora(tokenId))
        .to.emit(nftDiscount, "NFTUsed");
    }

    await expect(
      nftDiscount.connect(alice).usePandora(tokenId)
    ).to.be.revertedWith("Usage limit reached");
  });

  it("should reset Pandora usage after 360 days", async function () {
    const tx = await nftDiscount.mintPandora(alice.address, "ipfs://pandora2");
    const receipt = await tx.wait();
    const tokenId = receipt.logs.find(l => l.eventName === "Transfer" && l.args.from === ZERO).args.tokenId;

    for (let i = 0; i < 10; i++) {
      await nftDiscount.connect(alice).usePandora(tokenId);
    }

    // Пролистываем 360 дней
    await network.provider.send("evm_increaseTime", [360 * 24 * 3600]);
    await network.provider.send("evm_mine");

    await expect(nftDiscount.connect(alice).usePandora(tokenId))
      .to.emit(nftDiscount, "NFTUsed");
  });

  it("should mint Jackpot NFT only by owner or DAO and make it non-transferable", async function () {
    const tx = await nftDiscount.mintJackpot(bob.address, 5, "ipfs://jackpot");
    const receipt = await tx.wait();
    const tokenId = receipt.logs.find(l => l.eventName === "Transfer" && l.args.from === ZERO).args.tokenId;

    await expect(
      nftDiscount.connect(bob).transferFrom(bob.address, other.address, tokenId)
    ).to.be.revertedWith("Jackpot NFTs are non-transferable");

    await expect(
      nftDiscount.connect(alice).mintJackpot(alice.address, 5, "ipfs://jackpot2")
    ).to.be.revertedWith("Not authorized for Jackpot mint");
  });

  it("should update NFT: burn old and mint new with preserved purchaseTime", async function () {
    // 1) Mint исходного NFT
    const tx1 = await nftDiscount.mint(owner.address, 7, "ipfs://original");
    const r1 = await tx1.wait();
    const oldId = r1.logs.find(l => l.eventName === "Transfer" && l.args.from === ZERO).args.tokenId;

    // 2) Сохраняем purchaseTime
    const beforeTime = (await nftDiscount.discountData(oldId)).purchaseTime;

    // 3) Выполняем updateNFT
    const tx2 = await nftDiscount.updateNFT(oldId, "ipfs://updated");
    const r2 = await tx2.wait();

    // 4) Находим новый mint-лог (from ZERO)
    const newId = r2.logs.find(l =>
      l.eventName === "Transfer" && l.args.from === ZERO
    ).args.tokenId;

    // 5) Проверяем владельца и purchaseTime
    expect(await nftDiscount.ownerOf(newId)).to.equal(owner.address);
    const afterTime = (await nftDiscount.discountData(newId)).purchaseTime;
    expect(afterTime).to.equal(beforeTime);

    // 6) Повторный update с тем же URI → revert с "New URI already used"
    await expect(
      nftDiscount.updateNFT(newId, "ipfs://updated")
    ).to.be.revertedWith("New URI already used");

    // 7) update несуществующего токена → revert с "ERC721: invalid token ID"
    await expect(
      nftDiscount.updateNFT(99999, "ipfs://nonexistent")
    ).to.be.revertedWith("ERC721: invalid token ID");
  });
});
