const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – дополнительные сценарии для покрытия ветвей", function () {
  let owner, alice, bob;
  let ibiti, bridgeStub, feeStub, userStatus;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Подмена BridgeManager на стаб из contracts/test/stubs.sol
    const BridgeFactory = await ethers.getContractFactory(
      "contracts/test/stubs.sol:BridgeManagerStub"
    );
    bridgeStub = await BridgeFactory.deploy();
    await bridgeStub.waitForDeployment();

    // Подмена FeeManager на стаб из того же файла
    const FeeFactory = await ethers.getContractFactory(
      "contracts/test/stubs.sol:FeeManagerStub"
    );
    feeStub = await FeeFactory.deploy();
    await feeStub.waitForDeployment();

    // DummyUserStatusManager
    const USM = await ethers.getContractFactory("DummyUserStatus");
    userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

    // Deploy IBITIcoin с нашими стабами
    const IBITIFactory = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITIFactory.deploy(
      "IBITI",               // name
      "IBI",                 // symbol
      owner.address,         // founderWallet
      owner.address,         // reserveWallet
      feeStub.target,        // feeManager → стаб
      userStatus.target,     // userStatusManager → стаб
      bridgeStub.target,     // bridgeManager → стаб
      ethers.ZeroAddress,    // stakingModule
      ethers.ZeroAddress     // daoModule
    );
    await ibiti.waitForDeployment();

    // Дадим Alice 100 токенов
    await ibiti.transfer(alice.address, ethers.parseUnits("100", 8));
  });

  it("reverts on insufficient allowance [branch: ERC20 require]", async () => {
    await expect(
      ibiti.connect(alice).transferFrom(
        alice.address,
        bob.address,
        ethers.parseUnits("1", 8)
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  describe("Покупка за BNB с возвратом остатка и edge-case", () => {
    beforeEach(async () => {
      await ibiti.connect(owner).setCoinPriceBNB(
        ethers.parseUnits("0.015", "ether")
      );
    });

    it("возвращает остаток BNB, когда отправлено больше, чем нужно", async () => {
      const wantLoss = ethers.parseUnits("0.015", "ether");
      await expect(
        () => ibiti.connect(alice).purchaseCoinBNB({
          value: ethers.parseUnits("0.02", "ether")
        })
      ).to.changeEtherBalance(alice, -wantLoss);
    });

    it("reverts при нулевой цене (0 BNB)", async () => {
      await ibiti.connect(owner).setCoinPriceBNB(0);
      await expect(
        ibiti.connect(alice).purchaseCoinBNB({ value: ethers.parseUnits("0.01", "ether") })
      ).to.be.revertedWithPanic(0x12);
    });
  });

  describe("BridgeMint / BridgeBurn через BridgeManagerStub", () => {
    it("bridgeBurn сжигает токены без ошибок", async () => {
      const amt = ethers.parseUnits("10", 8);
      await ibiti.transfer(alice.address, amt);

      await ibiti.connect(alice).bridgeBurn(alice.address, amt);
      expect(await ibiti.balanceOf(alice.address))
        .to.equal(ethers.parseUnits("100", 8));
    });
  });

  describe("FeeManager-флаги в _doTransfer с FeeManagerStub", () => {
    beforeEach(async () => {
      await ibiti.connect(owner).setTransferFeeEnabled(true);
      await ibiti.connect(owner).setBurnPercentage(50);
    });

    it("применяет 10% fee, сжигает 50% и отдаёт founder остаток", async () => {
      const amt    = ethers.parseUnits("20", 8);
      const feeAmt = (amt * 10n) / 100n;    // 10% = 2 токена
      const burn   = (feeAmt * 50n) / 100n; // 50% от 2 = 1 токен
      const distro = feeAmt - burn;         // 1 токен
      const net    = amt - feeAmt;          // 18 токенов

      const beforeBob   = await ibiti.balanceOf(bob.address);
      const beforeOwner = await ibiti.balanceOf(owner.address);

      await expect(
        ibiti.connect(alice).transfer(bob.address, amt)
      )
        .to.emit(ibiti, "FounderFeePaid")
        .withArgs(alice.address, feeAmt);

      expect(await ibiti.balanceOf(bob.address))
        .to.equal(beforeBob + net);
      expect(await ibiti.balanceOf(owner.address))
        .to.equal(beforeOwner + distro);
    });
  });
});
