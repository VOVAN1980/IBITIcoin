const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager — branch coverage", () => {
  let owner, buyer;
  let nftDiscount, ibiti, usdt, saleManager;
  let dec; // фактические десятичные для USDT (8)

  beforeEach(async () => {
    [owner, buyer] = await ethers.getSigners();

    // 1) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 2) Деплой ERC20-моков
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    // IBITI с 18 десятичными
    ibiti = await ERC20.deploy(
      "IBITIcoin",
      "IBI",
      owner.address,
      ethers.parseEther("1000")
    );
    await ibiti.waitForDeployment();
    // USDT с 8 десятичными
    const supply = ethers.parseUnits("1000", 8);
    usdt = await ERC20.deploy("Tether", "USDT", owner.address, supply);
    await usdt.waitForDeployment();
    dec = await usdt.decimals(); // 8

    // 3) Деплой SaleManager
    const SM = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await SM.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      owner.address // fake oracle
    );
    await saleManager.waitForDeployment();

    // 4) Назначаем SaleManager оператором чеканки в NFTDiscount
    await nftDiscount.connect(owner).setDiscountOperator(saleManager.target);
  });

  /* --- pause / unpause --- */
  it("reverts buyNFTWithIBITI when paused", async () => {
    await saleManager.pause();
    await expect(
      saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
    ).to.be.revertedWith("Pausable: paused");
  });

  it("allows buyNFTWithIBITI after unpause but reverts for price not set", async () => {
    await saleManager.pause();
    await saleManager.unpause();
    await expect(
      saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
    ).to.be.revertedWith("Price not set");
  });

  /* --- buyNFTWithIBITI branches --- */
  it("reverts if oracle disabled", async () => {
    await saleManager.setOracleEnabled(false);
    await expect(
      saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
    ).to.be.revertedWith("Oracle disabled");
  });

  it("reverts if price not set", async () => {
    await expect(
      saleManager.connect(buyer).buyNFTWithIBITI(1, "uri")
    ).to.be.revertedWith("Price not set");
  });

  it("reverts on invalid IBITI price from oracle", async () => {
    await saleManager.setNFTPrice(2, 100);
    await expect(
      saleManager.connect(buyer).buyNFTWithIBITI(2, "uri")
    ).to.be.reverted; // ожидаем revert от оракула
  });

  /* --- buyNFTWithUSDT branches --- */
  it("reverts if price not set", async () => {
    await expect(
      saleManager.connect(buyer).buyNFTWithUSDT(1, "uri")
    ).to.be.revertedWith("Price not set");
  });

  it("succeeds when price set", async () => {
    await saleManager.setNFTPrice(3, 200);       // $2.00

    // готовим баланс и allowance
    const tenUsdt = ethers.parseUnits("10", dec); // 10 USDT
    const twoUsdt = ethers.parseUnits("2", dec);  // ожидаемая цена = 2 USDT

    await usdt.connect(owner).transfer(buyer.address, tenUsdt);
    await usdt.connect(buyer).approve(saleManager.target, tenUsdt);

    // покупка
    await expect(
      saleManager.connect(buyer).buyNFTWithUSDT(3, "uri")
    )
      .to.emit(saleManager, "NFTPurchased")
      .withArgs(buyer.address, 3, twoUsdt, usdt.target);
  });

  /* --- price view getters --- */
  it("getCurrentIBITIPrice reverts if oracle disabled", async () => {
    await saleManager.setOracleEnabled(false);
    await expect(saleManager.getCurrentIBITIPrice(1)).to.be.revertedWith(
      "Oracle disabled"
    );
  });

  it("getCurrentIBITIPrice reverts if price not set", async () => {
    await expect(saleManager.getCurrentIBITIPrice(1)).to.be.revertedWith(
      "Price not set"
    );
  });

  it("getCurrentIBITIPrice reverts on invalid oracle price", async () => {
    await saleManager.setNFTPrice(4, 50);
    await expect(saleManager.getCurrentIBITIPrice(4)).to.be.reverted;
  });

  it("getCurrentUSDTPrice reverts if price not set", async () => {
    await expect(saleManager.getCurrentUSDTPrice(1)).to.be.revertedWith(
      "Price not set"
    );
  });

  it("getCurrentUSDTPrice returns correct scaled value", async () => {
    await saleManager.setNFTPrice(5, 150); // $1.50
    const expected = ethers.parseUnits("1.5", dec);
    expect(await saleManager.getCurrentUSDTPrice(5)).to.equal(expected);
  });
});
