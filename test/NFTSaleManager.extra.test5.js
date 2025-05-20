const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("NFTSaleManager — extra coverage", function () {
  let nftSaleManager, nftDiscount;
  let ibitiToken, usdtToken;
  let priceOracle, pool;
  let owner, buyer;

  beforeEach(async function () {
    [owner, buyer] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibitiToken = await ERC20Mock.deploy("IBITI", "IBI", owner.address, ethers.parseUnits("10000000", 8));
    await ibitiToken.waitForDeployment();

    usdtToken = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("10000000", 8));
    await usdtToken.waitForDeployment();

    const VolumeWeightedOracle = await ethers.getContractFactory("VolumeWeightedOracle");
    priceOracle = await VolumeWeightedOracle.deploy(8);
    await priceOracle.waitForDeployment();

    const MockUniswapV2Pair = await ethers.getContractFactory("MockUniswapV2Pair");
    pool = await MockUniswapV2Pair.deploy(1_000_000, 2_000_000_000_000);
    await pool.waitForDeployment();

    await priceOracle.connect(owner).addPool(pool.target);
    await priceOracle.connect(owner).updatePrice();

    const NFTSaleManager = await ethers.getContractFactory("NFTSaleManager");
    nftSaleManager = await NFTSaleManager.deploy(
      nftDiscount.target,
      ibitiToken.target,
      usdtToken.target,
      priceOracle.target
    );
    await nftSaleManager.waitForDeployment();

    await nftDiscount.connect(owner).setDAOModule(nftSaleManager.target);
    await nftSaleManager.connect(owner).setNFTPrice(5, 500);

    await ibitiToken.transfer(buyer.address, ethers.parseUnits("1000", 8));
    await ibitiToken.connect(buyer).approve(nftSaleManager.target, ethers.parseUnits("1000", 8));
    await usdtToken.transfer(buyer.address, ethers.parseUnits("1000", 8));
    await usdtToken.connect(buyer).approve(nftSaleManager.target, ethers.parseUnits("1000", 8));
  });

  describe("Buy NFT with IBITI", function () {
    it("should revert buyNFTWithIBITI when price not set", async function () {
      await nftSaleManager.connect(owner).setNFTPrice(10, 0);
      await expect(
        nftSaleManager.connect(buyer).buyNFTWithIBITI(10, "ipfs://someURI")
      ).to.be.revertedWith("Price not set");
    });

    it("should allow buyNFTWithIBITI at correct rate and mint NFT", async function () {
      await expect(
        nftSaleManager.connect(buyer).buyNFTWithIBITI(5, "ipfs://uniqueURI1")
      )
        .to.emit(nftSaleManager, "NFTPurchased")
        .withArgs(buyer.address, anyValue, anyValue, ibitiToken.target);
      const current = await nftSaleManager.getCurrentIBITIPrice(5);
      expect(current).to.equal(250n);
    });
  });

  describe("Buy NFT with USDT", function () {
    it("should revert buyNFTWithUSDT when price not set", async function () {
      await nftSaleManager.connect(owner).setNFTPrice(5, 0);
      await expect(
        nftSaleManager.connect(buyer).buyNFTWithUSDT(5, "ipfs://someURI")
      ).to.be.revertedWith("Price not set");
    });

    it("should allow buyNFTWithUSDT at correct rate and mint NFT", async function () {
      const currentUsdt = await nftSaleManager.getCurrentUSDTPrice(5);
      expect(currentUsdt).to.equal(500000000n);
      await expect(
        nftSaleManager.connect(buyer).buyNFTWithUSDT(5, "ipfs://uniqueURI2")
      )
        .to.emit(nftSaleManager, "NFTPurchased")
        .withArgs(buyer.address, anyValue, anyValue, usdtToken.target);
    });
  });

  describe("Get current prices", function () {
    it("should return correct current prices for IBITI and USDT", async function () {
      const ibitiPrice = await nftSaleManager.getCurrentIBITIPrice(5);
      const usdtPrice = await nftSaleManager.getCurrentUSDTPrice(5);
      expect(ibitiPrice).to.equal(250n);
      expect(usdtPrice).to.equal(500000000n);
    });
  });
});
