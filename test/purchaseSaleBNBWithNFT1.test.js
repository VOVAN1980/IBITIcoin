const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Purchase & BNB Sale (with & without NFT)", function () {
  let owner, alice, bob;
  let feeManager, userStatusManager, bridgeManager, nftDiscount, stakingModule, ibiti;
  const e8 = (n) => ethers.parseUnits(n.toString(), 8);

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    /* dummy ERC-20 для конструктора FeeManager */
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const stub      = await ERC20Mock.deploy("Dummy", "DMY");
    await stub.waitForDeployment();
    await stub.mint(owner.address, ethers.parseUnits("1", 18));

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(stub.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    const Bridge = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await Bridge.deploy();
    await bridgeManager.waitForDeployment();

    const NFD = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFD.deploy();
    await nftDiscount.waitForDeployment();

    const DummyStake = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await DummyStake.deploy();
    await stakingModule.waitForDeployment();

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

    /* связи */
    await feeManager.setTokenContract(ibiti.target);
    await ibiti.setNFTDiscount(nftDiscount.target);
    await nftDiscount.setDiscountOperator(ibiti.target);

    /* комиссии */
    await feeManager.setHoldDiscountEnabled(false);   // ← выключили «hold»-скидку
    await feeManager.setBaseFees(0, 10);              // sell 10 %

    await ibiti.setPurchaseFeeEnabled(false);
    await ibiti.setTransferFeeEnabled(false);
    await ibiti.setSaleFeeEnabled(true);

    /* расчёты в BNB: 1 wei = 1 IBI */
    await ibiti.setAcceptedPayment(ethers.ZeroAddress, true);
    await ibiti.setCoinPriceBNB(1);
  });

  it("purchase without NFT: no fee", async function () {
    await expect(() =>
      ibiti.connect(alice).purchaseCoinBNB({ value: 1 })
    ).to.changeEtherBalance(alice, -1);
    expect(await ibiti.balanceOf(alice.address)).to.equal(e8(1));
  });

  it("sale without NFT: 10% sale fee", async function () {
    await owner.sendTransaction({ to: ibiti.target, value: 100 });
    await ibiti.transfer(bob.address, e8(100));

    await expect(() =>
      ibiti.connect(bob).sellCoinBNB(e8(100), 0)
    ).to.changeEtherBalance(bob, 90n);   // 100 − 10 %
  });

  it("sale with NFT: discount reduces fee", async function () {
    await owner.sendTransaction({ to: ibiti.target, value: 100 });
    await ibiti.transfer(bob.address, e8(100));

    await nftDiscount.mint(bob.address, 50, "ipfs://discount50");

    await expect(() =>
      ibiti.connect(bob).sellCoinBNB(e8(100), 0)
    ).to.changeEtherBalance(bob, 95n);   // 100 − (10 % × 50 %) = 95
  });
});

