const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Purchase and Sale (with & without NFT)", function () {
  let owner, alice, bob;
  let usdt, feeManager, userStatusManager, bridgeManager, nftDiscount, stakingModule, ibiti;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    /* USDT mock (8 decimals) */
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    usdt = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("1000", 8));
    await usdt.waitForDeployment();

    /* FeeManager */
    const FM = await ethers.getContractFactory("FeeManager");
    feeManager = await FM.deploy(usdt.target);
    await feeManager.waitForDeployment();

    /* UserStatusManager */
    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    /* Bridge + NFTDiscount + DummyStake */
    const BM  = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    const NFD = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFD.deploy();
    const DSM = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await DSM.deploy();

    await bridgeManager.waitForDeployment();
    await nftDiscount.waitForDeployment();
    await stakingModule.waitForDeployment();

    /* IBITIcoin */
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      stakingModule.target,
      owner.address
    );
    await ibiti.waitForDeployment();

    /* Wire up */
    await feeManager.setTokenContract(ibiti.target);
    await ibiti.setNFTDiscount(nftDiscount.target);
    await nftDiscount.setDiscountOperator(ibiti.target);

    /* Disable hold discount → база 10 % без -2 п.п. */
    await feeManager.setHoldDiscountEnabled(false);
    await feeManager.setBaseFees(0, 10);            // buy 0 %, sell 10 %

    /* Enable USDT payments */
    await ibiti.setAcceptedPayment(usdt.target, true);
    await ibiti.setCoinPriceToken(usdt.target, ethers.parseUnits("1", 8));

    /* Fee flags: purchase 0 %, p2p 0 %, sale on */
    await ibiti.setPurchaseFeeEnabled(false);
    await ibiti.setTransferFeeEnabled(false);
    await ibiti.setSaleFeeEnabled(true);
  });

  it("purchase without NFT: no fee", async function () {
    await usdt.mint(alice.address, ethers.parseUnits("100", 8));
    await usdt.connect(alice).approve(ibiti.target, ethers.parseUnits("100", 8));

    await ibiti.connect(alice).purchaseCoinToken(usdt.target, ethers.parseUnits("100", 8));
    expect(await ibiti.balanceOf(alice.address)).to.equal(ethers.parseUnits("100", 8));
  });

  it("purchase with NFT: no fee", async function () {
    await nftDiscount.mint(alice.address, 50, "uri-alice");
    await usdt.mint(alice.address, ethers.parseUnits("50", 8));
    await usdt.connect(alice).approve(ibiti.target, ethers.parseUnits("50", 8));

    await ibiti.connect(alice).purchaseCoinToken(usdt.target, ethers.parseUnits("50", 8));
    expect(await ibiti.balanceOf(alice.address)).to.equal(ethers.parseUnits("50", 8));
  });

  it("sale without NFT: 10% sale fee", async function () {
    await usdt.mint(ibiti.target, ethers.parseUnits("1000", 8));
    await ibiti.transfer(bob.address, ethers.parseUnits("100", 8));

    await ibiti.connect(bob).sellCoinToken(usdt.target, ethers.parseUnits("100", 8), 0);
    expect(await usdt.balanceOf(bob.address)).to.equal(ethers.parseUnits("90", 8)); // 100 – 10 %
  });

  it("sale with NFT: discount reduces fee", async function () {
    await usdt.mint(ibiti.target, ethers.parseUnits("1000", 8));
    await ibiti.transfer(bob.address, ethers.parseUnits("100", 8));
    await nftDiscount.mint(bob.address, 50, "uri-bob"); // 50 % скидка на fee

    await ibiti.connect(bob).sellCoinToken(usdt.target, ethers.parseUnits("100", 8), 0);
    expect(await usdt.balanceOf(bob.address)).to.equal(ethers.parseUnits("95", 8)); // 100 – (10 × 0.5) = 95
  });
});
