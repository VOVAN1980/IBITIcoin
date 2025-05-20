const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – Internal logic coverage with MockFeeManager", function () {
  let owner, user, spender;
  let ibiti, nftDiscount, feeManager, userStatus, bridgeManager;
  let founder, reserve, dao, staking;

  beforeEach(async function () {
    [owner, user, spender, founder, reserve, dao, staking] = await ethers.getSigners();

    // 1) NFTDiscount
    const NFT = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFT.deploy();
    await nftDiscount.waitForDeployment();

    // 2) MockFeeManager вместо FeeManager
    const MockFee = await ethers.getContractFactory("MockFeeManager");
    feeManager = await MockFee.deploy();
    await feeManager.waitForDeployment();

    // 3) UserStatusManager
    const UserStatus = await ethers.getContractFactory("UserStatusManager");
    userStatus = await UserStatus.deploy();
    await userStatus.waitForDeployment();

    // 4) BridgeManager
    const Bridge = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await Bridge.deploy();
    await bridgeManager.waitForDeployment();

    // 5) IBITIcoin с моками вместо настоящих модулей
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI",
      "IBI",
      founder.address,
      reserve.address,
      feeManager.target,      // mock
      userStatus.target,
      bridgeManager.target,
      staking.address,
      dao.address
    );
    await ibiti.waitForDeployment();

    // Распространение токенов и разрешения
    await ibiti.connect(founder).transfer(user.address, ethers.parseUnits("1000", 8));
    await ibiti.connect(user).approve(spender.address, ethers.parseUnits("500", 8));
  });

  it("calls _spendAllowance when spendAllowance is true", async () => {
    // просто проверяем, что transferFrom проходит без revert
    await expect(
      ibiti.connect(spender).transferFrom(user.address, owner.address, ethers.parseUnits("100", 8))
    ).to.not.be.reverted;
  });

  it("skips _chargeFee if all fees are disabled", async () => {
    await ibiti.setPurchaseFeeEnabled(false);
    await ibiti.setTransferFeeEnabled(false);
    await ibiti.setSaleFeeEnabled(false);

    await expect(
      ibiti.connect(user).transfer(owner.address, ethers.parseUnits("10", 8))
    ).to.not.be.reverted;
  });

  it("honors transfer fee branch when enabled (Mock always returns fee=0)", async () => {
    await ibiti.setTransferFeeEnabled(true);
    await ibiti.setSaleFeeEnabled(true);

    // делаем пару трансферов, чтобы установить holdingStartTime
    await ibiti.connect(user).transfer(owner.address, ethers.parseUnits("10", 8));
    await ibiti.connect(owner).transfer(user.address, ethers.parseUnits("10", 8));

    // финальный transfer должен пройти (fee=0 в mock)
    await expect(
      ibiti.connect(user).transfer(owner.address, ethers.parseUnits("10", 8))
    ).to.not.be.reverted;
  });

  it("calls refund logic with .call and handles failure", async () => {
    const RefundTest = await ethers.getContractFactory("RefundTest");
    const refund = await RefundTest.deploy();
    await refund.waitForDeployment();

    await expect(refund.testRefund()).to.emit(refund, "RefundSuccess");

    await refund.setRevertOnReceive(true);
    await expect(refund.testRefund()).to.be.reverted;
  });
});
