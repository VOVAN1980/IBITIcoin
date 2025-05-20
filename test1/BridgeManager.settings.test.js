const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BridgeManager Settings", function() {
  let bm, owner, addr1;
  // Нулевой адрес как литерал
  const ZERO_ADDR = "0x" + "0".repeat(40);

  beforeEach(async function() {
    [owner, addr1] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy(); // контракт из BridgeManager.sol :contentReference[oaicite:0]{index=0}
  });

  it("setBridgePaused emits BridgePaused and pauses/unpauses", async function() {
    // Пауза
    await expect(bm.setBridgePaused(true))
      .to.emit(bm, "BridgePaused")
      .withArgs(true);
    // После паузы любые setBridge должны падать
    await expect(
      bm.setBridge(ZERO_ADDR, true)
    ).to.be.revertedWith("Pausable: paused");

    // Снятие паузы
    await expect(bm.setBridgePaused(false))
      .to.emit(bm, "BridgePaused")
      .withArgs(false);
    // Теперь можно, но нулевой мост всё равно невалиден
    await expect(
      bm.setBridge(ZERO_ADDR, true)
    ).to.be.revertedWith("Invalid bridge");
  });

  it("setGovernance emits GovernanceEnabled and sets governanceEnabled flag", async function() {
    // Включаем governance
    await expect(bm.setGovernance(addr1.address, true))
      .to.emit(bm, "GovernanceEnabled")
      .withArgs(addr1.address, true);
    expect(await bm.governance()).to.equal(addr1.address);
    expect(await bm.governanceEnabled()).to.equal(true);

    // Нельзя вызывать повторно
    await expect(
      bm.setGovernance(addr1.address, false)
    ).to.be.revertedWith("Governance already set");
  });

  it("setDaoSettings emits DaoSettingsUpdated and validates parameters", async function() {
    // Включаем DAO режим с валидным кошельком
    await expect(bm.setDaoSettings(true, addr1.address))
      .to.emit(bm, "DaoSettingsUpdated")
      .withArgs(true, addr1.address);
    expect(await bm.daoEnabled()).to.equal(true);
    expect(await bm.daoWallet()).to.equal(addr1.address);

    // Нельзя включить с нулевым адресом
    await expect(
      bm.setDaoSettings(true, ZERO_ADDR)
    ).to.be.revertedWith("Invalid DAO wallet");

    // Отключаем DAO режим (daoWallet может быть нулевым)
    await expect(bm.setDaoSettings(false, ZERO_ADDR))
      .to.emit(bm, "DaoSettingsUpdated")
      .withArgs(false, ZERO_ADDR);
    expect(await bm.daoEnabled()).to.equal(false);
  });
});
