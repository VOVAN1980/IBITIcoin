const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – персональный лимит на Epic", function () {
  let owner, userA, userB, operator, dao, staking, nft;
  const epicDiscount = 50; // Только 50, 75 или 100 разрешено!

  beforeEach(async function () {
    [owner, userA, userB, operator, dao, staking] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Настроить права
    await nft.setDiscountOperator(operator.address);
    await nft.setDAOModule(dao.address);
    await nft.setStakingModule(staking.address);

    // NFTLevel.Epic = 3 (скорее всего)
    await nft.setMonthlyLimit(3, 3); // 3 — это enum для Epic
    await nft.setSupplyCap(3, 1000);
  });

  it("каждый адрес не может превысить monthlyLimit Epic, другой адрес не зависит", async function () {
    // userA минтит 3 Epic (50%)
    for (let i = 0; i < 3; i++) {
      await expect(
        nft.connect(owner).mint(userA.address, epicDiscount, `ipfs://epicA-${i}`)
      ).to.emit(nft, "NFTMinted");
    }
    // userA пытается минтить 4-й — реверт
    await expect(
      nft.connect(owner).mint(userA.address, epicDiscount, "ipfs://epicA-4")
    ).to.be.revertedWith("Monthly mint limit reached");

    // userB — тоже самое
    for (let i = 0; i < 3; i++) {
      await expect(
        nft.connect(owner).mint(userB.address, epicDiscount, `ipfs://epicB-${i}`)
      ).to.emit(nft, "NFTMinted");
    }
    await expect(
      nft.connect(owner).mint(userB.address, epicDiscount, "ipfs://epicB-4")
    ).to.be.revertedWith("Monthly mint limit reached");
  });
});
