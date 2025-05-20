const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("NFTSaleManager — full test", function () {
  let saleManager, discount, ibiti, usdt, oracle, pool;
  let owner, alice;
  const DISCOUNT = 10;
  const PRICE_USD = 500n;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    discount = await NFTDiscount.deploy();
    await discount.waitForDeployment();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibiti = await ERC20Mock.deploy("IBITI", "IBI", owner.address, ethers.parseUnits("10000", 8));
    await ibiti.waitForDeployment();
    usdt = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("10000", 6));
    await usdt.waitForDeployment();

    const OracleCF = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await OracleCF.deploy(await usdt.decimals());
    await oracle.waitForDeployment();

    const PairCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pool = await PairCF.deploy(1000, 2000);
    await pool.waitForDeployment();

    await oracle.addPool(pool.target);
    await ethers.provider.send("evm_increaseTime", [600]);
    await ethers.provider.send("evm_mine", []);
    await oracle.updatePrice();

    const SaleCF = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await SaleCF.deploy(
      discount.target,
      ibiti.target,
      usdt.target,
      oracle.target
    );
    await saleManager.waitForDeployment();

    await discount.connect(owner).setDAOModule(saleManager.target);
    await saleManager.connect(owner).setNFTPrice(DISCOUNT, PRICE_USD);

    await ibiti.transfer(alice.address, ethers.parseUnits("1000", 8));
    await ibiti.connect(alice).approve(saleManager.target, ethers.parseUnits("1000", 8));
    await usdt.transfer(alice.address, ethers.parseUnits("1000", 6));
    await usdt.connect(alice).approve(saleManager.target, ethers.parseUnits("1000", 6));
  });

  it("should revert buyNFTWithIBITI when price not set", async function () {
    await saleManager.setNFTPrice(999, 0n);
    await expect(
      saleManager.connect(alice).buyNFTWithIBITI(999, "uri")
    ).to.be.revertedWith("Price not set");
  });

  it("should revert buyNFTWithUSDT when price not set", async function () {
    await saleManager.setNFTPrice(888, 0n);
    await expect(
      saleManager.connect(alice).buyNFTWithUSDT(888, "uri")
    ).to.be.revertedWith("Price not set");
  });

  it("should revert if IBITI price from oracle is zero", async function () {
    const ZeroOracle = await (await ethers.getContractFactory("VolumeWeightedOracle")).deploy(await usdt.decimals());
    await ZeroOracle.waitForDeployment();
    const SM2 = await ethers.getContractFactory("NFTSaleManager");
    const sm2 = await SM2.deploy(
      discount.target,
      ibiti.target,
      usdt.target,
      ZeroOracle.target
    );
    await sm2.waitForDeployment();
    await discount.connect(owner).setDAOModule(sm2.target);
    await sm2.connect(owner).setNFTPrice(DISCOUNT, PRICE_USD);
    await expect(
      sm2.connect(alice).buyNFTWithIBITI(DISCOUNT, "uri")
    ).to.be.revertedWith("Invalid IBITI price");
  });

  it("should buy NFT with IBITI and emit event", async function () {
    const price = await saleManager.getCurrentIBITIPrice(DISCOUNT);
    await ibiti.transfer(alice.address, price);
    await ibiti.connect(alice).approve(saleManager.target, price);

    await expect(
      saleManager.connect(alice).buyNFTWithIBITI(DISCOUNT, "uri")
    )
      .to.emit(saleManager, "NFTPurchased")
      .withArgs(alice.address, DISCOUNT, price, ibiti.target);
  });

  it("should buy NFT with USDT and emit event", async function () {
    const price = await saleManager.getCurrentUSDTPrice(DISCOUNT);
    await usdt.transfer(alice.address, price);
    await usdt.connect(alice).approve(saleManager.target, price);

    await expect(
      saleManager.connect(alice).buyNFTWithUSDT(DISCOUNT, "uri")
    )
      .to.emit(saleManager, "NFTPurchased")
      .withArgs(alice.address, DISCOUNT, price, usdt.target);
  });

  it("should return correct price in IBITI and USDT", async function () {
    const ib = await saleManager.getCurrentIBITIPrice(DISCOUNT);
    const us = await saleManager.getCurrentUSDTPrice(DISCOUNT);
    expect(ib).to.equal(250000000n);
    expect(us).to.equal(500000000n);
  });

  it("should revert getCurrent*Price when price is not set", async function () {
    await saleManager.setNFTPrice(DISCOUNT, 0n);
    await expect(saleManager.getCurrentIBITIPrice(DISCOUNT)).to.be.revertedWith("Price not set");
    await expect(saleManager.getCurrentUSDTPrice(DISCOUNT)).to.be.revertedWith("Price not set");
  });
});
