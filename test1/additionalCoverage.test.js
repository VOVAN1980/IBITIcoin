const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Additional Coverage Tests", function () {
  let owner, user;
  let tokenMock, feeManager, oracle, pairMock;

  before(async function () {
    [owner, user] = await ethers.getSigners();

    const ERC20MockCF = await ethers.getContractFactory("ERC20Mock");
    tokenMock = await ERC20MockCF.deploy(
      "TKN",
      "TKN",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await tokenMock.waitForDeployment();

    const FeeManagerCF = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerCF.deploy(tokenMock.target);
    await feeManager.waitForDeployment();

    const PairMockCF = await ethers.getContractFactory("MockUniswapV2Pair");
    pairMock = await PairMockCF.deploy(
      ethers.parseUnits("5", 18),
      ethers.parseUnits("10", 18)
    );
    await pairMock.waitForDeployment();

    const OracleCF = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await OracleCF.deploy(18);
    await oracle.waitForDeployment();
    await oracle.addPool(pairMock.target);
  });

  describe("FeeManager calculateFee branches", function () {
    it("returns non-zero fee when no discount applied", async function () {
      const amount = ethers.parseUnits("100", 8);
      const fee = await feeManager.calculateFee(
        owner.address,
        amount,
        false, false, false, false,
        0,
        0
      );
      expect(fee).to.be.a("bigint").and.to.be.gt(0);
    });

    it("returns 0 fee when nftDiscount >= 100 bp", async function () {
      const fee = await feeManager.calculateFee(
        user.address,
        ethers.parseUnits("50", 8),
        false, false, false, false,
        0,
        100
      );
      expect(fee).to.equal(0);
    });

    it("returns 0 fee when nftDiscount > 100 bp", async function () {
      const fee = await feeManager.calculateFee(
        user.address,
        ethers.parseUnits("10", 8),
        false, false, false, false,
        0,
        101
      );
      expect(fee).to.equal(0);
    });
  });

  describe("VolumeWeightedOracle functionality", function () {
    it("calculates correct weighted price from one pool", async function () {
      await oracle.updatePrice();
      const price = await oracle.getPrice();
      expect(price).to.equal(ethers.parseUnits("2", 18));
    });

    it("returns 0 when no pools configured", async function () {
      const OracleCF = await ethers.getContractFactory("VolumeWeightedOracle");
      const emptyOracle = await OracleCF.deploy(18);
      await emptyOracle.waitForDeployment();
      expect(await emptyOracle.getPrice()).to.equal(0);
    });
  });
});
