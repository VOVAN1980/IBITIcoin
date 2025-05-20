const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager — branch coverage (test14)", function () {
  let owner, buyer;
  let nftDiscount, ibiti, usdt, saleManager;
  let dec; // десятичные USDT

  beforeEach(async function () {
    [owner, buyer] = await ethers.getSigners();

    // 1) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 2) Деплой мок-ERC20
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    // IBITI с 8 десятичными (ERC20Mock.override)
    ibiti = await ERC20Mock.deploy(
      "IBITIcoin",
      "IBI",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await ibiti.waitForDeployment();

    // USDT с 8 десятичными
    usdt = await ERC20Mock.deploy(
      "Tether",
      "USDT",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await usdt.waitForDeployment();

    dec = await usdt.decimals(); // 8

    // 3) Деплой менеджера продаж
    const SM = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await SM.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      owner.address // используем owner как dummy oracle
    );
    await saleManager.waitForDeployment();

    // 4) Дать saleManager право чеканить в NFTDiscount
    await nftDiscount.connect(owner).setDiscountOperator(saleManager.target);
  });

  describe("pause / unpause", function () {
    it("reverts buyNFTWithIBITI when paused", async function () {
      await saleManager.pause();
      await expect(
        saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
      ).to.be.revertedWith("Pausable: paused");
    });

    it("allows buyNFTWithIBITI after unpause but reverts for price not set", async function () {
      await saleManager.pause();
      await saleManager.unpause();
      await expect(
        saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
      ).to.be.revertedWith("Price not set");
    });
  });

  describe("buyNFTWithIBITI branches", function () {
    it("reverts if oracle disabled", async function () {
      await saleManager.setOracleEnabled(false);
      await expect(
        saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
      ).to.be.revertedWith("Oracle disabled");
    });

    it("reverts if price not set", async function () {
      await expect(
        saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
      ).to.be.revertedWith("Price not set");
    });

    it("reverts on invalid IBITI price from oracle", async function () {
      await saleManager.setNFTPrice(2, 100);
      await expect(
        saleManager.connect(buyer).buyNFTWithIBITI(2, "uri")
      ).to.be.reverted; // panic / без сообщения
    });
  });

  describe("buyNFTWithUSDT branches", function () {
    it("reverts if price not set", async function () {
      await expect(
        saleManager.connect(buyer).buyNFTWithUSDT(1, "uri")
      ).to.be.revertedWith("Price not set");
    });

    it("succeeds when price set", async function () {
      // Устанавливаем цену: уровень 3 → 200 центов = $2.00
      await saleManager.setNFTPrice(3, 200);

      const deposit = ethers.parseUnits("10", dec); // 10 USDT
      const expectedPay = ethers.parseUnits("2", dec); // 2 USDT

      await usdt.connect(owner).transfer(buyer.address, deposit);
      await usdt.connect(buyer).approve(saleManager.target, deposit);

      await expect(
        saleManager.connect(buyer).buyNFTWithUSDT(3, "uri")
      )
        .to.emit(saleManager, "NFTPurchased")
        .withArgs(
          buyer.address,
          3,
          expectedPay,
          usdt.target
        );
    });
  });

  describe("price view getters", function () {
    it("getCurrentIBITIPrice reverts if oracle disabled", async function () {
      await saleManager.setOracleEnabled(false);
      await expect(
        saleManager.getCurrentIBITIPrice(1)
      ).to.be.revertedWith("Oracle disabled");
    });

    it("getCurrentIBITIPrice reverts if price not set", async function () {
      await expect(
        saleManager.getCurrentIBITIPrice(1)
      ).to.be.revertedWith("Price not set");
    });

    it("getCurrentIBITIPrice reverts on invalid oracle price", async function () {
      await saleManager.setNFTPrice(4, 50);
      await expect(
        saleManager.getCurrentIBITIPrice(4)
      ).to.be.reverted;
    });

    it("getCurrentUSDTPrice reverts if price not set", async function () {
      await expect(
        saleManager.getCurrentUSDTPrice(1)
      ).to.be.revertedWith("Price not set");
    });

    it("getCurrentUSDTPrice returns correct scaled value", async function () {
      await saleManager.setNFTPrice(5, 150); // 150 центов = $1.50
      const price = await saleManager.getCurrentUSDTPrice(5);
      // priceUSD * 10^(decimals-2) = 150 * 10^6
      expect(price).to.equal(ethers.parseUnits("150", 6));
    });
  });
});
