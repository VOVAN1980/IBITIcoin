// test/NFTSaleManager.admin.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager – admin setters & oracle toggles", function () {
  let owner, alice;
  let nftDiscount, ibiti, usdt, saleManager;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    // deploy NFTDiscount mock
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();

    // deploy 8-decimal ERC20Mocks for IBITI and USDT
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibiti = await ERC20Mock.deploy(
      "IBITIcoin", "IBI", owner.address,
      ethers.parseUnits("1000", 8)
    );
    usdt = await ERC20Mock.deploy(
      "Tether", "USDT", owner.address,
      ethers.parseUnits("1000", 8)
    );

    // deploy the sale manager
    const NFTSaleManager = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await NFTSaleManager.deploy(
      nftDiscount.target,
      ibiti.target,
      usdt.target,
      owner.address    // initial oracle
    );
  });

  describe("setNFTPrice", function () {
    it("only owner can set price", async function () {
      await expect(
        saleManager.connect(alice).setNFTPrice(42, 123)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("emits PriceSet and stores price in cents", async function () {
      await expect(saleManager.setNFTPrice(7, 777))
        .to.emit(saleManager, "PriceSet")
        .withArgs(7, 777);

      // the public mapping nftPriceUSD should now return 777
      expect(await saleManager.nftPriceUSD(7)).to.equal(777);
    });
  });

  describe("updateOracle", function () {
    it("only owner can update oracle", async function () {
      await expect(
        saleManager.connect(alice).updateOracle(alice.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("emits OracleUpdated and changes priceOracle", async function () {
      const oldOracle = await saleManager.priceOracle();
      await expect(saleManager.updateOracle(alice.address))
        .to.emit(saleManager, "OracleUpdated")
        .withArgs(alice.address);

      expect(await saleManager.priceOracle()).to.equal(alice.address);
    });

    it("reverts when newOracle is zero address", async function () {
      await expect(
        saleManager.updateOracle(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid oracle");
    });
  });

  describe("setOracleEnabled", function () {
    it("only owner can toggle oracleEnabled", async function () {
      await expect(
        saleManager.connect(alice).setOracleEnabled(false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("emits OracleToggled and toggles state", async function () {
      // initial state is true
      await expect(saleManager.setOracleEnabled(false))
        .to.emit(saleManager, "OracleToggled")
        .withArgs(false);
      expect(await saleManager.oracleEnabled()).to.equal(false);

      await expect(saleManager.setOracleEnabled(true))
        .to.emit(saleManager, "OracleToggled")
        .withArgs(true);
      expect(await saleManager.oracleEnabled()).to.equal(true);
    });
  });
});
