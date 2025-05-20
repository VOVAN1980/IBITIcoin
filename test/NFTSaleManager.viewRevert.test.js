const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("NFTSaleManager – view functions revert when price unset", () => {
  it("getCurrent*Price → 'Price not set'", async () => {
    const [deployer] = await ethers.getSigners();

    const ND  = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    const IBI = await (await ethers.getContractFactory("ERC20Mock"))
                .deploy("IBI","IBI", deployer.address, 1n);
    const USD = await (await ethers.getContractFactory("ERC20Mock"))
                .deploy("USDT","USDT", deployer.address, 1n);

    // priceOracle не используется, можно передать любой валидный адрес
    const SM  = await (await ethers.getContractFactory("NFTSaleManager"))
                .deploy(ND.target, IBI.target, USD.target, deployer.address);

    await expect(SM.getCurrentIBITIPrice(1))
      .to.be.revertedWith("Price not set");
    await expect(SM.getCurrentUSDTPrice(1))
      .to.be.revertedWith("Price not set");
  });
});
