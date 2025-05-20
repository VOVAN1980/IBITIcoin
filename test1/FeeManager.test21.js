const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – feature toggles and calculateFee basics", function () {
  let owner, alice, feeToken, feeManager;
  const BASE_AMOUNT = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    // Deploy mock ERC20 token for fees
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    feeToken = await ERC20Mock.deploy(
      "FeeToken", "FEE", owner.address,
      ethers.parseUnits("1000000", 18)
    );
    await feeToken.waitForDeployment();

    // Deploy FeeManager
    const FeeMgr = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeMgr.deploy(feeToken.target);
    await feeManager.waitForDeployment();
  });

  describe("Feature toggle setters", function () {
    it("default discounts are enabled", async function () {
      expect(await feeManager.vipDiscountEnabled()).to.be.true;
      expect(await feeManager.stakingDiscountEnabled()).to.be.true;
      expect(await feeManager.holdDiscountEnabled()).to.be.true;
    });

    it("owner can toggle vipDiscountEnabled when not paused", async function () {
      await feeManager.setVipDiscountEnabled(false);
      expect(await feeManager.vipDiscountEnabled()).to.be.false;
      await feeManager.setVipDiscountEnabled(true);
      expect(await feeManager.vipDiscountEnabled()).to.be.true;
    });

    it("reverts if non-owner tries to toggle", async function () {
      await expect(
        feeManager.connect(alice).setVipDiscountEnabled(false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts when paused", async function () {
      await feeManager.pause();
      await expect(
        feeManager.setStakingDiscountEnabled(false)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("calculateFee basic scenario", function () {
    it("calculateFee returns correct sell fee for default settings", async function () {
      const amount = BASE_AMOUNT;
      // calculate fee for a sell (isBuy = false)
      const fee = await feeManager.calculateFee(
        alice.address,
        amount,
        false,  // isBuy
        false,  // stakingActive
        false,  // isVIP
        false,  // isWhale
        0,      // holdingDuration
        0       // nftDiscount
      );
      // default baseSellFee is 10% => fee should be amount / 10
      const expected = amount / 10n;
      expect(fee).to.equal(expected);
    });
  });
});
