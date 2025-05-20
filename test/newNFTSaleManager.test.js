const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager", function () {
  let owner, alice;
  let nftDiscount, ibiti, usdt, oracle, pair, nftSaleManager;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    // 1) Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount", owner);
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 2) Deploy ERC20 mocks
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", owner);
    ibiti = await ERC20Mock.deploy(
      "IBITI", "IBT",
      owner.address,
      ethers.parseUnits("1000000", 8)
    );
    await ibiti.waitForDeployment();
    usdt = await ERC20Mock.deploy(
      "USDT", "USDT",
      owner.address,
      ethers.parseUnits("1000000", 6)
    );
    await usdt.waitForDeployment();

    // 3) Deploy Oracle and add a pool
    const MockOracle = await ethers.getContractFactory("VolumeWeightedOracle", owner);
    oracle = await MockOracle.deploy(usdt.decimals());
    await oracle.waitForDeployment();
    const MockPair = await ethers.getContractFactory("MockUniswapV2Pair", owner);
    pair = await MockPair.deploy(1000, 2000);
    await pair.waitForDeployment();
    await oracle.addPool(pair.target);
    // ensure oracle has a cached price before using it
    await oracle.updatePrice();

    // 4) Deploy NFTSaleManager
    const NFTSaleManager = await ethers.getContractFactory("NFTSaleManager", owner);
    nftSaleManager = await NFTSaleManager.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      oracle.target
    );
    await nftSaleManager.waitForDeployment();

    // 5) Give minting right
    await nftDiscount.connect(owner).setDAOModule(nftSaleManager.target);

    // 6) Set price: 10% → $5.00
    await nftSaleManager.connect(owner).setNFTPrice(10, 500);
  });

  it("allows purchase of NFT with IBITI", async function () {
    const price = await nftSaleManager.getCurrentIBITIPrice(10);
    await ibiti.transfer(alice.address, price);
    await ibiti.connect(alice).approve(nftSaleManager.target, price);

    await expect(
      nftSaleManager.connect(alice).buyNFTWithIBITI(10, "ipfs://cid")
    )
      .to.emit(nftSaleManager, "NFTPurchased")
      .withArgs(alice.address, 10, price, ibiti.target);
  });

  it("allows purchase of NFT with USDT", async function () {
    const price = await nftSaleManager.getCurrentUSDTPrice(10);
    await usdt.transfer(alice.address, price);
    await usdt.connect(alice).approve(nftSaleManager.target, price);

    await expect(
      nftSaleManager.connect(alice).buyNFTWithUSDT(10, "ipfs://cid")
    )
      .to.emit(nftSaleManager, "NFTPurchased")
      .withArgs(alice.address, 10, price, usdt.target);
  });

  it("reverts if IBITI payment insufficient", async function () {
    const price = await nftSaleManager.getCurrentIBITIPrice(10);
    const insufficient = price - 1n;
    await ibiti.transfer(alice.address, insufficient);
    await ibiti.connect(alice).approve(nftSaleManager.target, insufficient);

    await expect(
      nftSaleManager.connect(alice).buyNFTWithIBITI(10, "ipfs://cid")
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("reverts if USDT payment insufficient", async function () {
    const price = await nftSaleManager.getCurrentUSDTPrice(10);
    const insufficient = price - 1n;
    await usdt.transfer(alice.address, insufficient);
    await usdt.connect(alice).approve(nftSaleManager.target, insufficient);

    await expect(
      nftSaleManager.connect(alice).buyNFTWithUSDT(10, "ipfs://cid")
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });
});
