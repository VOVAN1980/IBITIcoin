// test/nftdiscount-coverage.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – extra coverage", function () {
  let nft, owner, dao, user;

  beforeEach(async function () {
    [owner, dao, user] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Назначаем DAO‑модуль для mint и awardVotingRewards
    await nft.setDAOModule(dao.address);
  });

  it("updateNFT burns old and mints new preserving purchaseTime", async function () {
    // Mint исходного токена
    await nft.mint(user.address, 5, "ipfs://oldURI");
    const oldId = 0;
    const before = await nft.discountData(oldId);
    const purchaseTime = before.purchaseTime;

    // Обновляем NFT
    await nft.updateNFT(oldId, "ipfs://newURI");
    const newId = 1;

    // Новый токен существует и имеет того же владельца
    expect(await nft.ownerOf(newId)).to.equal(user.address);

    // Сохранился purchaseTime
    const after = await nft.discountData(newId);
    expect(after.purchaseTime).to.equal(purchaseTime);

    // Старый токен недействителен
    await expect(nft.ownerOf(oldId))
      .to.be.revertedWith("ERC721: invalid token ID");
  });

  it("awardVotingRewards issues correct jackpot NFTs", async function () {
    const winners = [user.address];
    const losers  = [owner.address];

    await nft.awardVotingRewards(winners, losers, "baseURI");

    // Должно быть 4 NFT: 2 для победителя, 2 для проигравшего
    expect(await nft.nextTokenId()).to.equal(4n);

    // Первые 2 — победитель (3%), уровень Jackpot (5)
    for (let i = 0; i < 2; i++) {
      const d = await nft.discountData(i);
      expect(d.discountPercent).to.equal(3);
      expect(d.level).to.equal(5);
    }
    // Следующие 2 — проигравший (1%), уровень Jackpot (5)
    for (let i = 2; i < 4; i++) {
      const d = await nft.discountData(i);
      expect(d.discountPercent).to.equal(1);
      expect(d.level).to.equal(5);
    }
  });

  it("monthly mint limit resets after 30 days", async function () {
    // По умолчанию monthlyLimit[Normal] = 10
    for (let i = 0; i < 10; i++) {
      await nft.mint(user.address, 1, `uri${i}`);
    }
    // 11-й упадёт по лимиту
    await expect(nft.mint(user.address, 1, "uri10"))
      .to.be.revertedWith("Monthly mint limit reached");

    // Перематываем на 31 день
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine");

    // И снова можно mint
    await nft.mint(user.address, 1, "uri10");
    expect(await nft.nextTokenId()).to.equal(11n);
  });

  it("owner can set supplyCap and monthlyLimit", async function () {
    await nft.setSupplyCap(0, 123);
    expect(await nft.supplyCap(0)).to.equal(123n);

    await nft.setMonthlyLimit(0, 45);
    expect(await nft.monthlyLimit(0)).to.equal(45n);
  });
});
