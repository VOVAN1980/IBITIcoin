const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTSaleManager – core workflow", function () {
  let owner, user, operator;
  let payToken, ibiToken, oracle, nftDiscount, saleManager;
  const PRICE_USD = 100; // cents
  const DISCOUNT = 1;    // valid percent for NFTDiscount
  const URI = "ipfs://SALE";
  const INITIAL_SUPPLY = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [owner, user, operator] = await ethers.getSigners();

    // ERC20 mocks for USDT and IBITI
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    payToken = await ERC20.deploy("USDT", "USDT", owner.address, INITIAL_SUPPLY);
    await payToken.waitForDeployment();
    ibiToken = await ERC20.deploy("IBI", "IBI", owner.address, INITIAL_SUPPLY);
    await ibiToken.waitForDeployment();

    // Deploy a simple Oracle (no consult functionality)
    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(18);
    await oracle.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();
    await nftDiscount.setDAOModule(owner.address);
    await nftDiscount.setStakingModule(owner.address);

    // Deploy SaleManager
    const Sale = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await Sale.deploy(
      nftDiscount.target,
      ibiToken.target,
      payToken.target,
      oracle.target
    );
    await saleManager.waitForDeployment();

    // Authorize saleManager to mint NFTs
    await nftDiscount.setDiscountOperator(saleManager.target);
  });

  it("reverts constructor on zero addresses", async function () {
    const Sale = await ethers.getContractFactory("NFTSaleManager");
    await expect(
      Sale.deploy(ethers.ZeroAddress, ibiToken.target, payToken.target, oracle.target)
    ).to.be.revertedWith("Invalid NFTDiscount");
    await expect(
      Sale.deploy(nftDiscount.target, ethers.ZeroAddress, payToken.target, oracle.target)
    ).to.be.revertedWith("Invalid IBITI token");
    await expect(
      Sale.deploy(nftDiscount.target, ibiToken.target, ethers.ZeroAddress, oracle.target)
    ).to.be.revertedWith("Invalid USDT token");
    await expect(
      Sale.deploy(nftDiscount.target, ibiToken.target, payToken.target, ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid oracle");
  });

  it("allows pause and unpause and toggles settings", async function () {
    await saleManager.pause();
    await expect(saleManager.setOracleEnabled(false)).to.be.revertedWith("Pausable: paused");
    await saleManager.unpause();

    await expect(saleManager.setOracleEnabled(false))
      .to.emit(saleManager, "OracleToggled").withArgs(false);
    await expect(saleManager.setNFTPrice(DISCOUNT, PRICE_USD))
      .to.emit(saleManager, "PriceSet").withArgs(DISCOUNT, PRICE_USD);

    expect(await saleManager.oracleEnabled()).to.be.false;
    expect(await saleManager.nftPriceUSD(DISCOUNT)).to.equal(PRICE_USD);
  });

  describe("buyNFTWithUSDT", function () {
    it("reverts if price not set", async function () {
      await expect(
        saleManager.connect(user).buyNFTWithUSDT(DISCOUNT, URI)
      ).to.be.revertedWith("Price not set");
    });

    it("executes purchase and mints NFT", async function () {
      // Set price
      await saleManager.setNFTPrice(DISCOUNT, PRICE_USD);
      const dec = await payToken.decimals();
      const usdtAmt = ethers.parseUnits((PRICE_USD / 100).toString(), dec);

      // Transfer USDT to user and approve
      await payToken.transfer(user.address, ethers.parseUnits("10", dec));
      await payToken.connect(user).approve(saleManager.target, usdtAmt);

      // Perform purchase
      await saleManager.connect(user).buyNFTWithUSDT(DISCOUNT, URI);

      // Check NFT minted and USDT balance
      expect((await nftDiscount.balanceOf(user.address)).toString()).to.equal("1");
            // Check USDT balance after purchase
      const initialBal = ethers.parseUnits("10", dec);
      const expectedBal = initialBal - usdtAmt;
      expect(await payToken.balanceOf(user.address)).to.equal(expectedBal);
    });
  });

  describe("buyNFTWithIBITI error paths", function () {
    it("reverts when oracle disabled", async function () {
      await saleManager.setOracleEnabled(false);
      await expect(
        saleManager.connect(user).buyNFTWithIBITI(DISCOUNT, URI)
      ).to.be.revertedWith("Oracle disabled");
    });

    it("reverts when price not set", async function () {
      await expect(
        saleManager.connect(user).buyNFTWithIBITI(DISCOUNT, URI)
      ).to.be.revertedWith("Price not set");
    });

    it("reverts when oracle call fails", async function () {
      // Set price
      await saleManager.setNFTPrice(DISCOUNT, PRICE_USD);
      await expect(
        saleManager.connect(user).buyNFTWithIBITI(DISCOUNT, URI)
      ).to.be.revertedWith("Invalid IBITI price");
    });
  });
});
