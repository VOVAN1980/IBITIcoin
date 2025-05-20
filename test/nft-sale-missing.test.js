const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager uncovered require() branches", function () {
  let nftSale, nftDiscount, ibiti, usdt, oracle;
  let owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("ERC20MintableMock");
    ibiti = await Token.deploy("IBITI", "IBITI");
    usdt = await Token.deploy("USDT", "USDT");

    const Oracle = await ethers.getContractFactory("MockPriceFeed");
    oracle = await Oracle.deploy(ethers.parseUnits("1", 8)); // цена IBITI = $1.00

    const NFT = await ethers.getContractFactory("NFTDiscountMock");
    nftDiscount = await NFT.deploy();

    const Sale = await ethers.getContractFactory("NFTSaleManager");
    nftSale = await Sale.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      oracle.target
    );

    await ibiti.mint(user.address, ethers.parseUnits("1000", 8));
    await usdt.mint(user.address, ethers.parseUnits("1000", 8));

    await ibiti.connect(user).approve(nftSale.target, ethers.MaxUint256);
    await usdt.connect(user).approve(nftSale.target, ethers.MaxUint256);
  });

  it("should revert in buyNFTWithIBITI if price not set [line 105]", async () => {
    await expect(
      nftSale.connect(user).buyNFTWithIBITI(99, "ipfs://test")
    ).to.be.revertedWith("Price not set");
  });

  it("should revert in buyNFTWithUSDT if price not set [line 148]", async () => {
    await expect(
      nftSale.connect(user).buyNFTWithUSDT(42, "ipfs://test")
    ).to.be.revertedWith("Price not set");
  });
});
