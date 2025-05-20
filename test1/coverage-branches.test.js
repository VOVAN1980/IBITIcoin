const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Additional branch coverage", function () {
  let owner, user;

  before(async () => {
    [owner, user] = await ethers.getSigners();
  });

  describe("VolumeWeightedOracle", function () {
    let oracle, MockPair;

    beforeEach(async () => {
      const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
      oracle = await Oracle.deploy(8);
      await oracle.waitForDeployment();

      MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
    });

    it("getPrice returns 0 when no pools", async function () {
      expect(await oracle.getPrice()).to.equal(0n);
    });

    it("ignores pools with zero reserves", async function () {
      const p0 = await MockPair.deploy(0, 1000);
      await p0.waitForDeployment();
      await oracle.addPool(p0.target);
      expect(await oracle.getPrice()).to.equal(0n);
    });

    it("calculates volume-weighted average across pools", async function () {
      const p1 = await MockPair.deploy(100, 2000);
      await p1.waitForDeployment();
      const p2 = await MockPair.deploy(200, 4000);
      await p2.waitForDeployment();

      await oracle.addPool(p1.target);
      await oracle.addPool(p2.target);

      // update cached price before reading
      await oracle.updatePrice();

      // price_i = r1*10^decimals / r0 = 2000*10^8/100 = 20 * 10^8
      const expected = 20n * 10n ** 8n;
      expect(await oracle.getPrice()).to.equal(expected);
    });

    it("allows removing a pool", async function () {
      const p = await MockPair.deploy(1, 1);
      await p.waitForDeployment();
      await oracle.addPool(p.target);
      expect(await oracle.poolCount()).to.equal(1n);
      await oracle.removePool(p.target);
      expect(await oracle.poolCount()).to.equal(0n);
    });
  });

  describe("NFTSaleManager uncovered paths", function () {
    let sale, discount, ibiti, usdt, priceFeed;
    let usdtAmount;

    beforeEach(async () => {
      const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
      discount = await NFTDiscount.deploy();
      await discount.waitForDeployment();

      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      ibiti = await ERC20Mock.deploy("IBITI", "IBI", owner.address, 0);
      await ibiti.waitForDeployment();
      usdt = await ERC20Mock.deploy("USDT", "USDT", owner.address, 0);
      await usdt.waitForDeployment();

      const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
      priceFeed = await MockPriceFeed.deploy(500n * 10n ** 8n);
      await priceFeed.waitForDeployment();

      const SaleMgr = await ethers.getContractFactory("NFTSaleManager");
      sale = await SaleMgr.deploy(
        discount.target,
        ibiti.target,
        usdt.target,
        priceFeed.target
      );
      await sale.waitForDeployment();

      await discount.setDAOModule(sale.target);
      await sale.setNFTPrice(10, 1000);

      const udec = Number(await usdt.decimals());
      await usdt.mint(owner.address, ethers.parseUnits("1000", udec));
      await usdt.approve(sale.target, ethers.parseUnits("1000", udec));

      usdtAmount = ethers.parseUnits("1000", udec - 2);
    });

    it("buyNFTWithUSDT works and mints discountNFT", async function () {
      const uri = "ipfs://token1";
      await expect(sale.buyNFTWithUSDT(10, uri))
        .to.emit(sale, "NFTPurchased")
        .withArgs(owner.address, 10n, usdtAmount, usdt.target);
      expect(await discount.balanceOf(owner.address)).to.equal(1n);
    });

    it("disable oracle stops IBITI purchase and view", async function () {
      await sale.setOracleEnabled(false);
      await expect(sale.buyNFTWithIBITI(10, "u"))
        .to.be.revertedWith("Oracle disabled");
      await expect(sale.getCurrentIBITIPrice(10))
        .to.be.revertedWith("Oracle disabled");
    });

    it("getCurrentUSDTPrice returns correct amount", async function () {
      expect(await sale.getCurrentUSDTPrice(10)).to.equal(usdtAmount);
    });
  });

  describe("FeeManager volatility paths", function () {
    let feeManager, tokenMock;

    beforeEach(async () => {
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      tokenMock = await ERC20Mock.deploy("TKN", "TK", owner.address, 0);
      await tokenMock.waitForDeployment();

      const FeeMgr = await ethers.getContractFactory("FeeManager");
      feeManager = await FeeMgr.deploy(tokenMock.target);
      await feeManager.waitForDeployment();

      await feeManager.setTokenContract(owner.address);
    });

    it("legacy volatility logic via setVolatilityParams", async function () {
      await feeManager.setVolatilityParams(100, 50, 150, 80, 100);
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(80n);
    });

    it("tiered volatility logic via setVolatilityTiers", async function () {
      await feeManager.setVolatilityTiers([
        { volumeThreshold: 1, volatilityValue: 200 }
      ]);
      await feeManager.updateActivity(owner.address, 2, false);
      await feeManager.auditParameters();
      expect(await feeManager.volatilityCoefficient()).to.equal(200n);
    });
  });
});
