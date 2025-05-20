const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BridgeManager Settings", function () {
  let bm, owner, other;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy(); // deploy сразу возвращает развернутый контракт :contentReference[oaicite:0]{index=0}
  });

  it("setBridgePaused emits BridgePaused and pauses/unpauses", async () => {
    // Ставим на паузу
    await expect(bm.setBridgePaused(true))
      .to.emit(bm, "BridgePaused")
      .withArgs(true);
    // В паузе любые контроллерские вызовы (например setRouter) должны падать
    await expect(bm.setRouter(ethers.ZeroAddress)).to.be.revertedWith("Pausable: paused");
    // Снимаем паузу
    await expect(bm.setBridgePaused(false))
      .to.emit(bm, "BridgePaused")
      .withArgs(false);
    // После анпауза setRouter снова работает
    await bm.setRouter(ethers.ZeroAddress);
    expect(await bm.router()).to.equal(ethers.ZeroAddress);
  });

  it("setGovernance emits GovernanceEnabled and sets governanceEnabled flag", async () => {
    const gov = other.address;
    await expect(bm.setGovernance(gov, true))
      .to.emit(bm, "GovernanceEnabled")
      .withArgs(gov, true);
    expect(await bm.governance()).to.equal(gov);
    expect(await bm.governanceEnabled()).to.be.true;
    // Повторная установка governance запрещена
    await expect(bm.setGovernance(other.address, false))
      .to.be.revertedWith("Governance already set");
  });

  it("setDaoSettings emits DaoSettingsUpdated and validates parameters", async () => {
    // Нельзя включить DAO без кошелька
    await expect(bm.setDaoSettings(true, ethers.ZeroAddress))
      .to.be.revertedWith("Invalid DAO wallet");
    // Корректная настройка
    await expect(bm.setDaoSettings(true, other.address))
      .to.emit(bm, "DaoSettingsUpdated")
      .withArgs(true, other.address);
    expect(await bm.daoEnabled()).to.be.true;
    expect(await bm.daoWallet()).to.equal(other.address);
  });

  it("switchOwnershipToDao works only when enabled and wallet set", async () => {
    // По умолчанию DAO выключен
    await expect(bm.switchOwnershipToDao())
      .to.be.revertedWith("DAO mode disabled");
    // Включаем и сразу пробуем (daoWallet всё ещё zero)
    await bm.setDaoSettings(true, other.address);
    // Теперь должно сработать
    await expect(bm.switchOwnershipToDao())
      .to.emit(bm, "OwnershipSwitchedToDao")
      .withArgs(other.address);
    expect(await bm.owner()).to.equal(other.address);
  });
});
