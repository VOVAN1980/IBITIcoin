const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager (uncovered cases)", function() {
  let owner, alice;
  let nftDiscount, ibitiToken, usdtToken, oracle, pair, saleMgr;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("NFTDiscount", owner);
    nftDiscount = await NFT.deploy();
    await nftDiscount.waitForDeployment();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", owner);
    ibitiToken = await ERC20Mock.deploy("IBITI", "IBI", owner.address, ethers.parseUnits("1000000", 8));
    await ibitiToken.waitForDeployment();
    usdtToken = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("1000000", 8));
    await usdtToken.waitForDeployment();

    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle", owner);
    oracle = await Oracle.deploy(8);
    await oracle.waitForDeployment();

    const Pair = await ethers.getContractFactory("MockUniswapV2Pair", owner);
    pair = await Pair.deploy(100, 200);
    await pair.waitForDeployment();

    await oracle.addPool(pair.target);
    await ethers.provider.send("evm_increaseTime", [600]);
    await ethers.provider.send("evm_mine");
    await oracle.updatePrice();

    const Sale = await ethers.getContractFactory("NFTSaleManager", owner);
    saleMgr = await Sale.deploy(
      nftDiscount.target,
      ibitiToken.target,
      usdtToken.target,
      oracle.target
    );
    await saleMgr.waitForDeployment();

    await nftDiscount.transferOwnership(saleMgr.target);
    await saleMgr.setNFTPrice(5, 100);
  });

  it("reverts buyNFTWithIBITI when price not set", async () => {
    await expect(
      saleMgr.connect(alice).buyNFTWithIBITI(3, "ipfs://x")
    ).to.be.revertedWith("Price not set");
  });

  it("reverts buyNFTWithIBITI when oracle price is zero", async () => {
    const NFT2 = await ethers.getContractFactory("NFTDiscount", owner);
    const nft2 = await NFT2.deploy(); await nft2.waitForDeployment();
    const Oracle2 = await ethers.getContractFactory("VolumeWeightedOracle", owner);
    const oracle2 = await Oracle2.deploy(8); await oracle2.waitForDeployment();
    const Sale2 = await ethers.getContractFactory("NFTSaleManager", owner);
    const sale2 = await Sale2.deploy(nft2.target, ibitiToken.target, usdtToken.target, oracle2.target);
    await sale2.waitForDeployment();
    await nft2.transferOwnership(sale2.target);
    await sale2.setNFTPrice(5, 100);
    await expect(
      sale2.connect(alice).buyNFTWithIBITI(5, "ipfs://no")
    ).to.be.revertedWith("Invalid IBITI price");
  });

  it("allows buyNFTWithIBITI at correct rate and mints NFT", async () => {
    const currentPrice = (200n * 10n**8n) / 100n;
    const expectedAmount = (100n * 10n**14n) / currentPrice;
    await ibitiToken.transfer(alice.address, expectedAmount);
    await ibitiToken.connect(alice).approve(saleMgr.target, expectedAmount);

    await expect(
      saleMgr.connect(alice).buyNFTWithIBITI(5, "ipfs://token")
    )
      .to.emit(saleMgr, "NFTPurchased")
      .withArgs(alice.address, 5, expectedAmount, ibitiToken.target);

    expect(await nftDiscount.balanceOf(alice.address)).to.equal(1);
  });

  it("reverts buyNFTWithUSDT when price not set", async () => {
    await expect(
      saleMgr.connect(alice).buyNFTWithUSDT(3, "ipfs://z")
    ).to.be.revertedWith("Price not set");
  });

  it("allows buyNFTWithUSDT at correct rate and mints NFT", async () => {
    await saleMgr.setNFTPrice(7, 200);
    const usdtAmount = 200n * 10n**6n;
    await usdtToken.transfer(alice.address, usdtAmount);
    await usdtToken.connect(alice).approve(saleMgr.target, usdtAmount);

    await expect(
      saleMgr.connect(alice).buyNFTWithUSDT(7, "ipfs://usdt")
    )
      .to.emit(saleMgr, "NFTPurchased")
      .withArgs(alice.address, 7, usdtAmount, usdtToken.target);

    expect(await nftDiscount.balanceOf(alice.address)).to.equal(1);
  });

  it("getCurrentIBITIPrice and getCurrentUSDTPrice return correct values", async () => {
    const ibitiPrice = await saleMgr.getCurrentIBITIPrice(5);
    const usdtPrice  = await saleMgr.getCurrentUSDTPrice(5);

    expect(ibitiPrice).to.equal((100n * 10n**14n) / ((200n * 10n**8n) / 100n));
    expect(usdtPrice).to.equal(100n * 10n**6n);
  });
});
