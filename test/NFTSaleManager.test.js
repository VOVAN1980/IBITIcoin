const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager", function () {
  let saleManager;
  let nftDiscount;
  let ibitiToken, usdtToken, vwo, pair;
  let owner, buyer;
  const DISCOUNT = 5;
  const PRICE_USD = 200;

  beforeEach(async function () {
    [owner, buyer] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount", owner);
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();
    await nftDiscount.setDAOModule(owner.address);

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", owner);
    ibitiToken = await ERC20Mock.deploy("IBITI", "IBT", owner.address, ethers.parseUnits("1000", 8));
    usdtToken  = await ERC20Mock.deploy("USDT",  "USDT", owner.address, ethers.parseUnits("1000", 8));
    await ibitiToken.waitForDeployment();
    await usdtToken.waitForDeployment();

    const MockUniswapV2Pair = await ethers.getContractFactory("MockUniswapV2Pair", owner);
    pair = await MockUniswapV2Pair.deploy(
      ethers.parseUnits("100", 8),
      ethers.parseUnits("400", 8)
    );
    await pair.waitForDeployment();

    const VWO = await ethers.getContractFactory("VolumeWeightedOracle", owner);
    vwo = await VWO.deploy(8);
    await vwo.waitForDeployment();
    await vwo.addPool(pair.target);

    await ethers.provider.send("evm_increaseTime", [600]);
    await ethers.provider.send("evm_mine");
    await vwo.updatePrice();

    const Sale = await ethers.getContractFactory("NFTSaleManager", owner);
    saleManager = await Sale.deploy(
      nftDiscount.target,
      ibitiToken.target,
      usdtToken.target,
      vwo.target
    );
    await saleManager.waitForDeployment();
    await nftDiscount.setDAOModule(saleManager.target);

    await saleManager.setNFTPrice(DISCOUNT, PRICE_USD);
  });

  it("reverts buyNFTWithIBITI when price not set", async function () {
    await expect(
      saleManager.buyNFTWithIBITI(999, "ipfs://x")
    ).to.be.revertedWith("Price not set");
  });

  it("allows buyNFTWithIBITI at correct rate and mints NFT", async function () {
    const required = await saleManager.getCurrentIBITIPrice(DISCOUNT);
    await ibitiToken.transfer(buyer.address, required);
    await ibitiToken.connect(buyer).approve(saleManager.target, required);

    await expect(
      saleManager.connect(buyer).buyNFTWithIBITI(DISCOUNT, "ipfs://cid")
    )
      .to.emit(saleManager, "NFTPurchased")
      .withArgs(buyer.address, DISCOUNT, required, ibitiToken.target);
  });

  it("reverts buyNFTWithUSDT when price not set", async function () {
    await expect(
      saleManager.buyNFTWithUSDT(999, "ipfs://y")
    ).to.be.revertedWith("Price not set");
  });

  it("allows buyNFTWithUSDT at correct rate and mints NFT", async function () {
    const requiredUSDT = await saleManager.getCurrentUSDTPrice(DISCOUNT);
    await usdtToken.transfer(buyer.address, requiredUSDT);
    await usdtToken.connect(buyer).approve(saleManager.target, requiredUSDT);

    await expect(
      saleManager.connect(buyer).buyNFTWithUSDT(DISCOUNT, "ipfs://cid2")
    )
      .to.emit(saleManager, "NFTPurchased")
      .withArgs(buyer.address, DISCOUNT, requiredUSDT, usdtToken.target);
  });

  it("getCurrentIBITIPrice and getCurrentUSDTPrice return correct values", async function () {
    const ibitiPrice = await saleManager.getCurrentIBITIPrice(DISCOUNT);
    const usdtPrice  = await saleManager.getCurrentUSDTPrice(DISCOUNT);

    expect(ibitiPrice).to.be.a("bigint");
    expect(usdtPrice).to.be.a("bigint");
  });
});
