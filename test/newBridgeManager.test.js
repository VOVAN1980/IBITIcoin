const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("New BridgeManager Tests", function () {
  let bridgeManager;
  let owner, addr1, addr2;

  // Реализуем вручную функцию форматирования строки в bytes32.
  function myFormatBytes32String(str) {
    // Получаем байтовое представление строки
    const bytes = ethers.toUtf8Bytes(str);
    if (bytes.length > 31) {
      throw new Error("String too long");
    }
    // Создаём Uint8Array длины 32 и заполняем его нулями
    let padded = new Uint8Array(32);
    padded.set(bytes); // копируем байты в начало массива
    // Возвращаем hex-строку
    return ethers.hexlify(padded);
  }

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BridgeManager.deploy();
    await bridgeManager.waitForDeployment();
  });

  it("should allow owner to set and verify a trusted bridge", async function () {
    // Устанавливаем мост: генерируются события BridgeAdded и BridgeSet
    await expect(bridgeManager.connect(owner).setBridge(addr1.address, true))
      .to.emit(bridgeManager, "BridgeAdded")
      .withArgs(addr1.address)
      .and.to.emit(bridgeManager, "BridgeSet")
      .withArgs(addr1.address, true, true);

    // Проверяем, что мост теперь доверенный и активный
    const bridgeInfo = await bridgeManager.bridges(addr1.address);
    expect(bridgeInfo.trusted).to.equal(true);
    expect(bridgeInfo.active).to.equal(true);
    expect(await bridgeManager.isTrustedBridge(addr1.address)).to.equal(true);
  });

  it("should revert if non-owner tries to set a bridge", async function () {
    // Попытка addr1 установить мост должна провалиться
    await expect(bridgeManager.connect(addr1).setBridge(addr2.address, true))
      .to.be.revertedWith("Only owner");
  });

  it("should update bridge info and then remove the bridge with mintedAmount reset", async function () {
    // Сначала устанавливаем мост
    await bridgeManager.connect(owner).setBridge(addr1.address, true);
    // Обновляем параметры моста, включая лимит (например, 1000) и описание
    const testBridgeType = myFormatBytes32String("TestBridge");
    await expect(
      bridgeManager.connect(owner).setBridgeInfo(addr1.address, true, true, testBridgeType, 1000, "Test Bridge")
    ).to.emit(bridgeManager, "BridgeInfoUpdated");

    // Вызываем removeBridge и проверяем событие и обнуление mintedAmount.
    await expect(bridgeManager.connect(owner).removeBridge(addr1.address))
      .to.emit(bridgeManager, "BridgeRemoved")
      .withArgs(addr1.address);

    // mintedAmount для данного моста должно быть 0 после удаления
    expect(await bridgeManager.mintedAmount(addr1.address)).to.equal(0);
    // Проверяем, что isTrustedBridge возвращает false для удалённого моста
    expect(await bridgeManager.isTrustedBridge(addr1.address)).to.equal(false);
  });

  it("should return false for an unregistered bridge", async function () {
    // Если мост не установлен, функция isTrustedBridge должна вернуть false
    expect(await bridgeManager.isTrustedBridge(addr2.address)).to.equal(false);
  });
});
