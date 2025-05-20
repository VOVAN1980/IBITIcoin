const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("IBITIcoin — BNB purchase / sale, VIP logic", function () {
  let owner, bob, ibiti, feeManager, userStatusManager;
  const e8 = (n) => ethers.parseUnits(n.toString(), 8);   // helper

  beforeEach(async function () {
    [owner, bob] = await ethers.getSigners();

    /*── заглушка ERC-20 для FeeManager ──*/
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const stubToken = await ERC20Mock.deploy("STUB", "STB", owner.address, 0);
    await stubToken.waitForDeployment();

    /*── FeeManager ──*/
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(stubToken.target);
    await feeManager.waitForDeployment();

    /*── UserStatusManager ──*/
    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    /*── Bridge + NFTDiscount заглушки ──*/
    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    const bridgeManager = await BridgeManager.deploy();
    await bridgeManager.waitForDeployment();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    const nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    /*── IBITIcoin ──*/
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI","IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      owner.address,          // staking stub
      owner.address           // DAO stub
    );
    await ibiti.waitForDeployment();

    /*── связываем ──*/
    await feeManager.setTokenContract(ibiti.target);
    await userStatusManager.setIBIToken(ibiti.target);
    await ibiti.setNFTDiscount(nftDiscount.target);

    /*── комиссии ──*/
    await feeManager.setHoldDiscountEnabled(false);
    await feeManager.setVipDiscountEnabled(true);   // важная строка
    await feeManager.setBaseFees(0, 10);            // sell 10 %

    await ibiti.setPurchaseFeeEnabled(false);
    await ibiti.setTransferFeeEnabled(false);
    await ibiti.setSaleFeeEnabled(true);

    /*── расчёты в BNB ──*/
    await ibiti.setAcceptedPayment(ethers.ZeroAddress, true);
    await ibiti.setCoinPriceBNB(1);                 // 1 wei = 1 IBI
  });

  it("продажа 100 IBI — комиссия 10 %", async function () {
    await owner.sendTransaction({ to: ibiti.target, value: 100 });
    await ibiti.transfer(bob.address, e8(100));

    await expect(() =>
      ibiti.connect(bob).sellCoinBNB(e8(100), 0)
    ).to.changeEtherBalance(bob, 90n);              // 10 % комиссия

    expect(await userStatusManager.isVIPUser(bob.address)).to.equal(false);
  });

  it("продажа 1 000 IBI при остатке ≥ 1 000 IBI — комиссия 8 %", async function () {
    // Bob хранит 2 000 IBI, продаёт 1 000, остаётся VIP
    await owner.sendTransaction({ to: ibiti.target, value: 2_000 });
    await ibiti.transfer(bob.address, e8(2_000));

    // до продажи VIP=true
    expect(await userStatusManager.isVIPUser(bob.address)).to.equal(true);

    // комиссия: 1 000 × 8 % = 80 wei → Bob получает 920 wei
    await expect(() =>
      ibiti.connect(bob).sellCoinBNB(e8(1_000), 0)
    ).to.changeEtherBalance(bob, 920n);

    // после продажи баланс = 1 000 IBI → всё ещё VIP
    expect(await userStatusManager.isVIPUser(bob.address)).to.equal(true);
  });
});
