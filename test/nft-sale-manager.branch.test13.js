const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager — branch coverage", function () {
  let owner, buyer;
  let nftDiscount, ibiti, usdt, saleManager;

  beforeEach(async function () {
    [owner, buyer] = await ethers.getSigners();

    // 1) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 2) Моки ERC20 (8 десятичных)
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    ibiti = await ERC20.deploy(
      "IBITIcoin", "IBI", owner.address,
      ethers.parseUnits("1000", 8)
    );
    await ibiti.waitForDeployment();
    usdt = await ERC20.deploy(
      "Tether", "USDT", owner.address,
      ethers.parseUnits("1000", 8)
    );
    await usdt.waitForDeployment();

    // 3) Деплой менеджера продаж
    const SM = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await SM.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      owner.address   // используем owner.address как "оракул" в тестах
    );
    await saleManager.waitForDeployment();

    // 4) Даем saleManager право чеканить NFTDiscount
    await nftDiscount.connect(owner).setDiscountOperator(saleManager.target);
  });

  describe("buyNFTWithUSDT branches", function () {
    it("reverts if price not set", async function () {
      await expect(
        saleManager.connect(buyer).buyNFTWithUSDT(1, "uri")
      ).to.be.revertedWith("Price not set");
    });

    it("succeeds when price set", async function () {
      // Устанавливаем цену: level=3, priceUSD=200 центов ($2)
      await saleManager.setNFTPrice(3, 200);

      // Переводим buyer’у и даем allowance
      const cost = ethers.parseUnits("2", 8); // $2 → 200 центов → 2 USDT с 8 дец.
      await usdt.connect(owner).transfer(buyer.address, cost);
      await usdt.connect(buyer).approve(saleManager.target, cost);

      // Покупаем и проверяем событие
      await expect(
        saleManager.connect(buyer).buyNFTWithUSDT(3, "uri")
      )
        .to.emit(saleManager, "NFTPurchased")
        .withArgs(
          buyer.address,
          3,
          cost,
          usdt.target
        );
    });
  });

  describe("pause / unpause", function () {
    it("reverts buyNFTWithUSDT when paused", async function () {
      await saleManager.pause();
      await expect(
        saleManager.connect(buyer).buyNFTWithUSDT(1, "uri")
      ).to.be.revertedWith("Pausable: paused");
    });

    it("allows buyNFTWithUSDT after unpause but reverts for price not set", async function () {
      await saleManager.pause();
      await saleManager.unpause();
      await expect(
        saleManager.connect(buyer).buyNFTWithUSDT(1, "uri")
      ).to.be.revertedWith("Price not set");
    });
  });

  describe("price view getters", function () {
    it("getCurrentUSDTPrice reverts if price not set", async function () {
      await expect(
        saleManager.getCurrentUSDTPrice(1)
      ).to.be.revertedWith("Price not set");
    });

    it("getCurrentUSDTPrice returns correct scaled value", async function () {
      // level=5, priceUSD=150 центов → $1.50 → 150 * 10^(8-2) = 150e6
      await saleManager.setNFTPrice(5, 150);
      const price = await saleManager.getCurrentUSDTPrice(5);
      expect(price).to.equal(ethers.parseUnits("150", 6));
    });
  });
});
