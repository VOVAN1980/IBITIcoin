const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – switchOwnershipToDao coverage", function () {
  let owner, gov, ibiti;
  const ZERO = ethers.ZeroAddress;
  // В контракте DAO_TRANSFER_DELAY = 7 дней
  const DAO_DELAY = 7 * 24 * 3600;

  beforeEach(async function () {
    [owner, gov] = await ethers.getSigners();

    // Деплой только IBITIcoin со всеми нулевыми модулями
    const IB = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IB.deploy(
      "IBI Coin",       // name_
      "IBI",            // symbol_
      owner.address,    // founderWallet
      owner.address,    // reserveWallet
      ZERO,             // feeManager
      ZERO,             // userStatusManager
      ZERO,             // bridgeManager
      ZERO,             // stakingModule
      ZERO              // daoModule
    );
    await ibiti.waitForDeployment();
  });

  it("reverts when daoEnabled=false", async function () {
    await expect(ibiti.switchOwnershipToDao()).to.be.reverted;
  });

  it("reverts if daoWallet not set after enableDAO", async function () {
    await ibiti.enableDAO(true);
    await expect(ibiti.switchOwnershipToDao()).to.be.reverted;
  });

  it("succeeds only after setting daoWallet and waiting delay", async function () {
    await ibiti.enableDAO(true);
    await ibiti.setDaoWallet(gov.address);

    // Ещё рано
    await expect(ibiti.switchOwnershipToDao()).to.be.reverted;

    // Прыгаем в будущее на 7 дней + 1 сек
    await ethers.provider.send("evm_increaseTime", [DAO_DELAY + 1]);
    await ethers.provider.send("evm_mine");

    await expect(ibiti.switchOwnershipToDao())
      .to.emit(ibiti, "OwnershipSwitchedToDao")
      .withArgs(gov.address);

    expect(await ibiti.owner()).to.equal(gov.address);
  });
});
