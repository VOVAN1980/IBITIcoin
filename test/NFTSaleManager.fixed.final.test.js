const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager — тесты цен и покупки", function () {
  let nftDiscount, saleManager, usdt, ibiti, oracle;
  let owner, user;

  const priceEntries = [
    { discount: 3, cents: 300 },
    { discount: 5, cents: 500 },
    { discount: 7, cents: 700 },
    { discount: 10, cents: 1000 },
    { discount: 15, cents: 1500 },
    { discount: 25, cents: 2500 },
    { discount: 50, cents: 5000 },
    { discount: 75, cents: 7500 },
    { discount: 100, cents: 10000 },
  ];

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    usdt = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("1000000", 6));
    ibiti = await ERC20Mock.deploy("IBITI", "IBITI", owner.address, ethers.parseUnits("1000000", 18));

    const OracleMock = await ethers.getContractFactory("PriceOracleMock");
    oracle = await OracleMock.deploy();

    const NFTDiscountFactory = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscountFactory.deploy();
    await nftDiscount.setPayToken(usdt.target);
    await nftDiscount.setIbitiToken(ibiti.target);
    await nftDiscount.setDiscountOperator(owner.address);

    const SaleManager = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await SaleManager.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      oracle.target
    );
    await nftDiscount.setDiscountOperator(saleManager.target);
  });

  it("по умолчанию цена == 0", async () => {
    for (const { discount } of priceEntries) {
      expect(await saleManager.nftPriceUSD(discount)).to.equal(0);
    }
  });

  it("владелец может задать цену, и она читается корректно", async () => {
    for (const { discount, cents } of priceEntries) {
      await saleManager.setNFTPrice(discount, cents);
      expect(await saleManager.nftPriceUSD(discount)).to.equal(cents);
    }
  });

  it("не владелец не может установить цену", async () => {
    await expect(
      saleManager.connect(user).setNFTPrice(5, 500)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("можно купить NFT за USDT", async () => {
    const entry = priceEntries[1];
    await saleManager.setNFTPrice(entry.discount, entry.cents);
    await usdt.transfer(user.address, ethers.parseUnits("1000", 6));
    await usdt.connect(user).approve(saleManager.target, ethers.parseUnits("1000", 6));

    await expect(
      saleManager.connect(user).buyNFTWithUSDT(entry.discount, "ipfs://example")
    ).to.emit(nftDiscount, "NFTMinted");
  });

  it("не удаётся купить NFT без установленной цены", async () => {
    await usdt.transfer(user.address, ethers.parseUnits("1000", 6));
    await usdt.connect(user).approve(saleManager.target, ethers.parseUnits("1000", 6));

    await expect(
      saleManager.connect(user).buyNFTWithUSDT(999, "ipfs://none")
    ).to.be.revertedWith("Price not set");
  });
});
