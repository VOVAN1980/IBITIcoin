// test/NFTSaleManager.adminEvent.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager – админ‑сеттеры генерируют события", () => {
  it("setNFTPrice / updateOracle", async () => {
    const [owner] = await ethers.getSigners();

    // быстрые моки
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    const nft = await NFTDiscount.deploy();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const ibi  = await ERC20Mock.deploy("IBI", "IBI", owner.address, 1);
    const usdt = await ERC20Mock.deploy("U",   "U",   owner.address, 1);

    const oracle1 = owner.address;
    const oracle2 = ethers.Wallet.createRandom().address;

    const NFTSaleManager = await ethers.getContractFactory("NFTSaleManager");
    const sm = await NFTSaleManager.deploy(
      nft.target,
      ibi.target,
      usdt.target,
      oracle1
    );

    await expect(sm.setNFTPrice(1, 999))
      .to.emit(sm, "PriceSet").withArgs(1, 999);

    await expect(sm.updateOracle(oracle2))
      .to.emit(sm, "OracleUpdated").withArgs(oracle2);
  });
});
