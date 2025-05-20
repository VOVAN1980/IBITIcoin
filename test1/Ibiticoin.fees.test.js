const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin — commission & roles & purchases + NFT discounts", function () {
  let owner, alice, bob, carol;
  let paymentToken;
  let feeManager, userStatusManager, bridgeManager, stakingModule, nftDiscount, daoModule;
  let IBITI, ibiti;

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // 1) Mock USD (8 decimals)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy(
      "USDT", "USDT",
      owner.address,
      ethers.parseUnits("1000000", 8)
    );
    await paymentToken.waitForDeployment();

    // 2) FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(paymentToken.target);
    await feeManager.waitForDeployment();

    // 3) UserStatusManager
    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    // 4) BridgeManager
    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    await bridgeManager.waitForDeployment();

    // 5) DummyStakingModule
    const DSM = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await DSM.deploy();
    await stakingModule.waitForDeployment();

    // 6) NFTDiscount
    const NFTD = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTD.deploy();
    await nftDiscount.waitForDeployment();

    // 7) DAO stub
    const MockDAO = await ethers.getContractFactory("MockDAO");
    daoModule = await MockDAO.deploy();
    await daoModule.waitForDeployment();

    // 8) IBITIcoin
    IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address,        // founderWallet
      owner.address,        // reserveWallet
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      stakingModule.target,
      daoModule.target
    );
    await ibiti.waitForDeployment();

    // link modules
    await feeManager.setTokenContract(ibiti.target);
    await nftDiscount.setDiscountOperator(ibiti.target);
    await ibiti.setNFTDiscount(nftDiscount.target);

    // initial balances
    await ibiti.transfer(alice.address, ethers.parseUnits("1000", 8));
    await paymentToken.transfer(alice.address, ethers.parseUnits("1000", 8));

    // purchase setup
    await ibiti.setAcceptedPayment(paymentToken.target, true);
    await ibiti.setCoinPriceToken(paymentToken.target, ethers.parseUnits("2", 8));
    await ibiti.setPurchaseFeeEnabled(false);

    await ibiti.setAcceptedPayment(ethers.ZeroAddress, true);
    await ibiti.setCoinPriceBNB(ethers.parseUnits("0.01", 8));
  });

  it("без скидок: calculateFee(sell) = amount * baseSellFee/100", async function () {
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(
      alice.address, amount,
      false, false, false, false, 0, 0
    );
    const baseSell = await feeManager.baseSellFee();
    expect(fee).to.equal(amount * baseSell / 100n);
  });

  it("стейкеры получают −10%*0.9 скидку на продажу", async function () {
    await feeManager.setStakingDiscountEnabled(true);
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(
      alice.address, amount,
      false, true, false, false, 0, 0
    );
    expect(fee).to.equal(amount * 9n / 100n);
  });

  it("VIP получают −2% доп. скидку на продажу", async function () {
    await userStatusManager.setVIPOverride(alice.address, true);
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(
      alice.address, amount,
      false, false, true, false, 0, 0
    );
    expect(fee).to.equal(amount * 8n / 100n);
  });

  it("whale получают +3% надбавку на продажу", async function () {
    await userStatusManager.setWhaleOverride(alice.address, true);
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(
      alice.address, amount,
      false, false, false, true, 0, 0
    );
    expect(fee).to.equal(amount * 13n / 100n);
  });

  it("holders (60+ дней) получают −2% скидку на продажу", async function () {
    const holding = 61 * 24 * 3600;
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(
      alice.address, amount,
      false, false, false, false, holding, 0
    );
    expect(fee).to.equal(amount * 8n / 100n);
  });

  it("простой перевод без комиссий, если transferFeeEnabled=false", async function () {
    await ibiti.connect(alice).transfer(bob.address, ethers.parseUnits("100", 8));
    expect(await ibiti.balanceOf(bob.address)).to.equal(ethers.parseUnits("100", 8));
  });

  it("перевод с комиссией, если transferFeeEnabled=true", async function () {
    await ibiti.setTransferFeeEnabled(true);
    await ibiti.connect(alice).transfer(bob.address, ethers.parseUnits("100", 8));
    expect(await ibiti.balanceOf(bob.address)).to.equal(ethers.parseUnits("90", 8));
  });

  it("покупка токенов за USDT без комиссий (purchaseFeeEnabled=false)", async function () {
    const amount = ethers.parseUnits("100", 8);
    const cost   = ethers.parseUnits("200", 8);
    await paymentToken.connect(alice).approve(ibiti.target, cost);
    await ibiti.connect(alice).purchaseCoinToken(paymentToken.target, amount);
    expect(await ibiti.balanceOf(alice.address)).to.equal(ethers.parseUnits("1100", 8));
  });

  it("продажа токенов за USDT с комиссией", async function () {
    const amount = ethers.parseUnits("100", 8);
    const cost   = ethers.parseUnits("200", 8);

    // buy 100 IBI
    await paymentToken.connect(alice).approve(ibiti.target, cost);
    await ibiti.connect(alice).purchaseCoinToken(paymentToken.target, amount);

    // approve IBI for sale
    await ibiti.connect(alice).approve(ibiti.target, amount);

    // enable transfer fee
    await ibiti.setTransferFeeEnabled(true);

    const before = await paymentToken.balanceOf(alice.address);
    await ibiti.connect(alice).sellCoinToken(paymentToken.target, amount, 0);
    const after  = await paymentToken.balanceOf(alice.address);

    const diff = after - before;
    expect(diff).to.equal(ethers.parseUnits("180", 8));
  });

  it("NFT-скидка (например 50%) уменьшает комиссию пропорционально", async function () {
    // mint NFT discount = 50%
    const uri = "ipfs://discount50";
    await nftDiscount.setPayToken(paymentToken.target);
    await nftDiscount.setIbitiToken(ibiti.target);
    await nftDiscount.setNftPrice(ethers.parseUnits("1", 8));
    await nftDiscount.mint(alice.address, 50, uri);

    const amount = ethers.parseUnits("100", 8);
    const cost   = ethers.parseUnits("200", 8);

    // buy 100 IBI
    await paymentToken.connect(alice).approve(ibiti.target, cost);
    await ibiti.connect(alice).purchaseCoinToken(paymentToken.target, amount);

    // approve IBI for sale
    await ibiti.connect(alice).approve(ibiti.target, amount);

    // enable transfer fee
    await ibiti.setTransferFeeEnabled(true);

    const before = await paymentToken.balanceOf(alice.address);
    await ibiti.connect(alice).sellCoinToken(paymentToken.target, amount, 0);
    const after  = await paymentToken.balanceOf(alice.address);

    const diff = after - before;
    // Gross payout = 200 USDT; комиссия 10% = 20; после 50% скидки комиссия = 10 → net = 200 − 10 = 190
    expect(diff).to.equal(ethers.parseUnits("190", 8));
  });
});

