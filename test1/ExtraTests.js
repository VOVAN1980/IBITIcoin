const { expect } = require("chai");
const { ethers }  = require("hardhat");

const { encodeBytes32String, parseUnits } = ethers;

describe("Дополнительные тесты для полного покрытия", function () {
  let maliciousToken, dummyUnstake;
  let aggregator;
  let bridgeManager;
  let owner, attacker, dummy;

  before(async () => {
    [owner, attacker, dummy] = await ethers.getSigners();
  });

    /* ─────────────────── AttackContract  ─────────────────── */
  describe("AttackContract", function () {
    beforeEach(async () => {
      /* заглушка с unstakeTokens() */
      const DummyUnstake = await ethers.getContractFactory("DummyUnstake");
      dummyUnstake = await DummyUnstake.deploy();
      await dummyUnstake.waitForDeployment();

      /* сам атакующий контракт */
      const AttackContract = await ethers.getContractFactory("AttackContract");
      maliciousToken = await AttackContract.deploy(dummyUnstake.target);
      await maliciousToken.waitForDeployment();
    });

    it("должен вызвать unstakeTokens дважды и установить attacked = true", async () => {
      // любой аккаунт шлёт «пустой» вызов → попадаем в fallback
    const tx = await attacker.sendTransaction({
    to: maliciousToken.target, // адрес AttackContract
    data: "0x"                 // без данных
  });
    await tx.wait();
 
    expect(await maliciousToken.attacked()).to.equal(true);
    });
  });

  /* ────────────────────  MockAggregator  ──────────────────── */
  describe("MockAggregator", function () {
    beforeEach(async () => {
      const MockAggregator = await ethers.getContractFactory("MockAggregator");
      aggregator = await MockAggregator.deploy(8);        // 8 decimals
      await aggregator.waitForDeployment();
    });

    it("должен возвращать корректный latestRoundData после setPrice", async () => {
      const price = 2000n * 10n ** 8n; // 2 000 USD * 10^8
      await aggregator.setPrice(price);

      const [, answer] = await aggregator.latestRoundData();
      expect(answer).to.equal(price);
    });

    it("getRoundData должен revert с 'Not implemented'", async () => {
      await expect(aggregator.getRoundData(1)).to.be.revertedWith("Not implemented");
    });
  });

  /* ────────────────────  BridgeManager  ──────────────────── */
  describe("BridgeManager – дополнительные ветви", function () {
    beforeEach(async () => {
      const BridgeManager = await ethers.getContractFactory("BridgeManager");
      bridgeManager = await BridgeManager.deploy();
      await bridgeManager.waitForDeployment();
    });

    it("должен добавить мост, удалить его и сбросить mintedAmount", async () => {
      const testBridge = attacker.address;
      const bType      = encodeBytes32String("test");

      await bridgeManager.setBridgeInfo(
        testBridge,
        true,   // trusted
        true,   // active
        bType,
        1000,   // лимит
        "desc"
      );

      const info = await bridgeManager.bridges(testBridge);
      expect(info.trusted).to.equal(true);

      await bridgeManager.checkAndUpdateBridgeMintBy(testBridge, 100);
      expect(await bridgeManager.mintedAmount(testBridge)).to.equal(100);

      await bridgeManager.removeBridge(testBridge);
      expect(await bridgeManager.mintedAmount(testBridge)).to.equal(0);
    });

    it("batchSetBridgeInfo должен revert при несоответствии длин массивов", async () => {
      const bType = encodeBytes32String("test");

      await expect(
        bridgeManager.batchSetBridgeInfo(
          [attacker.address, dummy.address], // 2 адреса
          [true],                            // остальное длиной 1
          [true],
          [bType],
          [100],
          ["desc"]
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });
});
