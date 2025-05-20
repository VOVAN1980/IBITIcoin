
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – uncovered fee logic (indirect coverage)", function () {
  let owner, user;
  let token, feeManager, userStatus, bridge, mockToken;

  const ONE = ethers.parseUnits("1", 8);

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Мок-платёжный токен
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    mockToken = await ERC20.deploy("PAY", "PAY", owner.address, ethers.parseUnits("1000000", 8));
    await mockToken.waitForDeployment();

    // FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(mockToken.target);
    await feeManager.waitForDeployment();

    // UserStatusManager
    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

    // BridgeManager
    const BM = await ethers.getContractFactory("BridgeManager");
    bridge = await BM.deploy();
    await bridge.waitForDeployment();

    // IBITIcoin
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await token.waitForDeployment();

    await token.setCoinPriceBNB(ONE / 2n);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
  });

  it("feeDisabledFor[msg.sender] skips _chargeFee (via purchaseCoinBNB)", async () => {
    await token.setFeeDisabled(user.address, true);
    await token.connect(owner).transfer(user.address, ONE);
    await token.setPurchaseFeeEnabled(true);

    await expect(token.connect(user).purchaseCoinBNB({ value: ONE }))
      .to.emit(token, "CoinPurchased");
  });

  it("_chargeFee skips when purchaseFeeEnabled = false (via purchaseCoinBNB)", async () => {
    await token.setFeeDisabled(user.address, false);
    await token.setPurchaseFeeEnabled(false);
    await token.connect(owner).transfer(user.address, ONE);
    await expect(token.connect(user).purchaseCoinBNB({ value: ONE }))
      .to.emit(token, "CoinPurchased");
  });

  it("_chargeFee skips when saleFeeEnabled = false (via sellCoinBNB)", async () => {
    await token.setSaleFeeEnabled(false);
    await token.connect(owner).transfer(user.address, ONE);
    await token.connect(user).approve(token.target, ONE);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
    await owner.sendTransaction({ to: token.target, value: ONE }); // пополнение контракта BNB

    await expect(token.connect(user).sellCoinBNB(ONE, 0))
      .to.emit(token, "CoinSold");
  });

  it("_chargeFee calculates proper holding duration indirectly", async () => {
    await token.connect(owner).transfer(user.address, ONE);
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    await token.setSaleFeeEnabled(true);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
    await token.connect(user).approve(token.target, ONE);
    await owner.sendTransaction({ to: token.target, value: ONE });

    await expect(token.connect(user).sellCoinBNB(ONE, 0))
      .to.emit(token, "CoinSold");
  });

  it("refund branch executes and passes", async () => {
    await token.setCoinPriceBNB(ONE / 2n);
    const cost = ONE / 2n;
    const refund = cost;
    const val = cost + refund;
    await expect(token.connect(user).purchaseCoinBNB({ value: val }))
      .to.emit(token, "CoinPurchased");
  });
});
