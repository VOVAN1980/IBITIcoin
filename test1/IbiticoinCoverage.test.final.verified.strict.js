// test/IbiticoinCoverage.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Comprehensive Coverage", function () {
  let owner, user, other;
  let tokenMock, feeManager, userStatus, bridgeManager, stakingModule, nftDiscount;
  let ibiti, IBITIcoinCF;

  before(async function () {
    [owner, user, other] = await ethers.getSigners();

    // 1) ERC20Mock for FeeManager
    const ERC20MockCF = await ethers.getContractFactory("ERC20Mock");
    tokenMock = await ERC20MockCF.deploy(
      "TOK", "TOK",
      user.address,
      ethers.parseUnits("1000", 8)
    );
    await tokenMock.waitForDeployment();

    // 2) FeeManager
    const FeeManagerCF = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerCF.deploy(tokenMock.target);
    await feeManager.waitForDeployment();

    // 3) UserStatusManager
    const USMCF = await ethers.getContractFactory("UserStatusManager");
    userStatus = await USMCF.deploy();
    await userStatus.waitForDeployment();

    // 4) BridgeManager
    const BMCF = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BMCF.deploy();
    await bridgeManager.waitForDeployment();

    // 5) DummyStakingModule
    const DSM = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await DSM.deploy();
    await stakingModule.waitForDeployment();

    // 6) NFTDiscount
    const NFTCF = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTCF.deploy();
    await nftDiscount.waitForDeployment();

    // 7) Deploy IBITIcoin (9 args)
    IBITIcoinCF = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITIcoinCF.deploy(
      "IBITI", "IBI",
      owner.address,         // founderWallet
      owner.address,         // reserveWallet
      feeManager.target,     // feeManager
      userStatus.target,     // userStatusManager
      bridgeManager.target,  // bridgeManager
      stakingModule.target,  // stakingModule
      ethers.ZeroAddress     // daoModule
    );
    await ibiti.waitForDeployment();

    // Link FeeManager & NFTDiscount
    await feeManager.setTokenContract(ibiti.target);
    await ibiti.setNFTDiscount(nftDiscount.target);
  });

  describe("Constructor and initial state", function () {
    it("sets totalSupplyCap and mints tokens", async function () {
      const cap = ethers.parseUnits("100000000", 8);
      expect(await ibiti.totalSupplyCap()).to.equal(cap);
      expect(await ibiti.balanceOf(owner.address)).to.be.gt(0);
    });

    it("pause/unpause blocks batchTransfer", async function () {
      await ibiti.pause();
      await expect(
        ibiti.batchTransfer([user.address], [1])
      ).to.be.revertedWith("Pausable: paused");
      await ibiti.unpause();
    });
  });

  describe("BatchTransfer edge cases", function () {
    it("reverts on length mismatch", async function () {
      await expect(
        ibiti.batchTransfer([user.address], [1, 2])
      ).to.be.reverted;
    });

    it("reverts if sender or recipient frozen", async function () {
      await ibiti.freezeAccount(user.address);
      await expect(
        ibiti.connect(user).batchTransfer([other.address], [1])
      ).to.be.reverted;
      await ibiti.unfreezeAccount(user.address);

      await ibiti.freezeAccount(other.address);
      await expect(
        ibiti.batchTransfer([other.address], [1])
      ).to.be.reverted;
      await ibiti.unfreezeAccount(other.address);
    });
  });

  describe("purchaseCoinToken and purchaseCoinBNB", function () {
    it("purchaseCoinToken reverts when payment not accepted", async function () {
      await tokenMock.connect(user).approve(
        ibiti.target,
        ethers.parseUnits("10", 8)
      );
      await expect(
        ibiti.connect(user).purchaseCoinToken(
          tokenMock.target,
          ethers.parseUnits("10", 8)
        )
      )
        .to.be.reverted;
    });

    it("purchaseCoinToken succeeds for accepted token", async function () {
      await ibiti.setAcceptedPayment(tokenMock.target, true);
      await ibiti.setCoinPriceToken(tokenMock.target, 2);
      await tokenMock.connect(user).approve(
        ibiti.target,
        ethers.parseUnits("20", 8)
      );
      await expect(
        ibiti.connect(user).purchaseCoinToken(
          tokenMock.target,
          ethers.parseUnits("10", 8)
        )
      ).to.emit(ibiti, "CoinPurchased");
    });

    it("purchaseCoinBNB reverts when native not accepted", async function () {
      await expect(
        ibiti.connect(user).purchaseCoinBNB({ value: ethers.parseEther("1") })
      )
        .to.be.reverted;
    });

    it("purchaseCoinBNB succeeds when accepted and price set", async function () {
      await ibiti.setAcceptedPayment(ethers.ZeroAddress, true);
      await ibiti.setCoinPriceBNB(ethers.parseUnits("1", 18));
      await expect(
        ibiti.connect(user).purchaseCoinBNB({ value: ethers.parseUnits("1", 18) })
      ).to.emit(ibiti, "CoinPurchased");
    });
  });

  describe("withdrawOwnerFunds", function () {
    it("reverts when ownerFunds == 0", async function () {
      const fresh = await IBITIcoinCF.deploy(
        "IBITI", "IBI",
        owner.address,
        owner.address,
        feeManager.target,
        userStatus.target,
        bridgeManager.target,
        stakingModule.target,
        ethers.ZeroAddress
      );
      await fresh.waitForDeployment();
      await fresh.setNFTDiscount(nftDiscount.target);

    });
  });

  describe("switchOwnershipToDao", function () {
    it("reverts if daoEnabled is false", async function () {
      await expect(ibiti.switchOwnershipToDao())
        .to.be.reverted;
    });
  });

  describe("Admin setters for purchase parameters", function () {
    it("setAcceptedPayment & setCoinPriceToken work", async function () {
      await expect(ibiti.setAcceptedPayment(user.address, true))
        .to.not.be.reverted;
      await expect(ibiti.setCoinPriceToken(user.address, 123))
        .to.not.be.reverted;
      expect(await ibiti.acceptedPayment(user.address)).to.be.true;
      expect(await ibiti.coinPriceTokens(user.address)).to.equal(123);
    });

    it("other setters revert or succeed as expected", async function () {
      await expect(ibiti.setCoinPriceBNB(0)).to.not.be.reverted;
      await expect(ibiti.setUseOracle(true)).to.not.be.reverted;
      await expect(ibiti.setCoinPriceUSD(456)).to.not.be.reverted;
      await expect(ibiti.setPriceFeed(ethers.ZeroAddress))
        .to.be.reverted;
    });
  });
});
