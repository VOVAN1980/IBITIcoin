const { expect } = require("chai");
const { ethers } = require("hardhat");

// Нулевой адрес
const ZERO = "0x0000000000000000000000000000000000000000";

describe("BridgeManager", function () {
  let bm, owner, governance, other;

  beforeEach(async () => {
    [owner, governance, other] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy();
    await bm.waitForDeployment();
  });

  describe("initial state", () => {
    it("should start with empty bridge list", async () => {
      // до добавления любой индекс должен revert
      await expect(bm.bridgeList(0)).to.be.reverted;
    });

    it("governanceEnabled is false by default", async () => {
      expect(await bm.governanceEnabled()).to.be.false;
    });
  });

  describe("owner-only controllers", () => {
    it("setBridge adds a new bridge and emits events", async () => {
      const br = ethers.Wallet.createRandom().address;

      await expect(bm.setBridge(br, true))
        .to.emit(bm, "BridgeAdded").withArgs(br)
        .and.to.emit(bm, "BridgeSet").withArgs(br, true, true);

      // теперь bridgeList(0) == br, а bridgeList(1) revert
      expect(await bm.bridgeList(0)).to.equal(br);
      await expect(bm.bridgeList(1)).to.be.reverted;
      expect(await bm.isTrustedBridge(br)).to.be.true;
    });

    it("setBridge toggles existing bridge without duplicating", async () => {
      const br = other.address;
      await bm.setBridge(br, true);
      await bm.setBridge(br, false);

      // всё ещё один элемент
      expect(await bm.bridgeList(0)).to.equal(br);
      await expect(bm.bridgeList(1)).to.be.reverted;
      expect(await bm.isTrustedBridge(br)).to.be.false;
    });

    it("setBridgeInfo sets all fields and emits BridgeInfoUpdated", async () => {
      const br   = ethers.Wallet.createRandom().address;
      const tp   = ethers.hexlify(ethers.randomBytes(32));
      const lim  = 777;
      const desc = "test description";

      await expect(
        bm.setBridgeInfo(br, false, true, tp, lim, desc)
      )
        .to.emit(bm, "BridgeInfoUpdated")
        .withArgs(br, tp, lim, desc);

      const info = await bm.bridges(br);
      const [trusted, active, bridgeType, limit, description] = info;
      expect(trusted).to.equal(false);
      expect(active).to.equal(true);
      expect(bridgeType).to.equal(tp);
      expect(limit).to.equal(lim);
      expect(description).to.equal(desc);
    });

    it("batchSetBridgeInfo reverts on array length mismatch", async () => {
      const br1 = ethers.Wallet.createRandom().address;
      const tp1 = ethers.hexlify(ethers.randomBytes(32));
      await expect(
        bm.batchSetBridgeInfo(
          [br1],
          [true, false],
          [true],
          [tp1],
          [1],
          ["d"]
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("removeBridge deletes bridge, resets mintedAmount and emits BridgeRemoved", async () => {
      const br = other.address;
      // добавляем мост и лимит, чтобы mint не падал
      await bm.setBridge(br, true);
      await bm.setBridgeInfo(br, true, true, ethers.ZeroHash, 100, "");
      // эмулируем mint
      await bm.connect(other).checkAndUpdateBridgeMint(10);
      expect(await bm.mintedAmount(br)).to.equal(10);

      await expect(bm.removeBridge(br))
        .to.emit(bm, "BridgeRemoved")
        .withArgs(br);

      // mintedAmount сброшен
      expect(await bm.mintedAmount(br)).to.equal(0);
      // bridgeList(0) снова revert
      await expect(bm.bridgeList(0)).to.be.reverted;

      // проверяем поля структуры
      const info = await bm.bridges(br);
      const [trusted, active, bridgeType, limit, description] = info;
      expect(trusted).to.equal(false);
      expect(active).to.equal(false);
      expect(bridgeType).to.equal(ethers.ZeroHash);
      expect(limit).to.equal(0);
      expect(description).to.equal("");
    });

    it("setRouter updates router and emits RouterUpdated", async () => {
      const r = ethers.Wallet.createRandom().address;
      await expect(bm.setRouter(r))
        .to.emit(bm, "RouterUpdated")
        .withArgs(ZERO, r);
      expect(await bm.router()).to.equal(r);
    });

    it("setBridgePaused toggles pause state", async () => {
      await expect(bm.setBridgePaused(true))
        .to.emit(bm, "BridgePaused")
        .withArgs(true);

      await expect(bm.setBridge(other.address, true))
        .to.be.reverted; // в паузе

      await expect(bm.setBridgePaused(false))
        .to.emit(bm, "BridgePaused")
        .withArgs(false);

      // снова рабочий режим
      await bm.setBridge(other.address, true);
    });
  });

  describe("governance mode", () => {
    beforeEach(async () => {
      await bm.connect(owner).setGovernance(governance.address, true);
    });

    it("only governance can call setBridge when enabled", async () => {
      const br = ethers.Wallet.createRandom().address;
      await expect(bm.connect(owner).setBridge(br, true))
        .to.be.revertedWith("Only governance");
      await bm.connect(governance).setBridge(br, true);
      expect(await bm.isTrustedBridge(br)).to.be.true;
    });

    it("governance can setBridgeInfo", async () => {
      const br   = ethers.Wallet.createRandom().address;
      const tp   = ethers.hexlify(ethers.randomBytes(32));
      const lim  = 123;
      const desc = "governance info";

      await expect(
        bm.connect(governance).setBridgeInfo(br, true, false, tp, lim, desc)
      )
        .to.emit(bm, "BridgeInfoUpdated")
        .withArgs(br, tp, lim, desc);

      const info = await bm.bridges(br);
      const [trusted, active] = info;
      expect(trusted).to.be.true;
      expect(active).to.equal(false);
    });

    it("governance batchSetBridgeInfo reverts on mismatch", async () => {
      const br1 = ethers.Wallet.createRandom().address;
      const br2 = ethers.Wallet.createRandom().address;
      const tp1 = ethers.hexlify(ethers.randomBytes(32));
      const tp2 = ethers.hexlify(ethers.randomBytes(32));

      await expect(
        bm.connect(governance).batchSetBridgeInfo(
          [br1, br2],
          [true],
          [true, true],
          [tp1, tp2],
          [1, 2],
          ["a", "b"]
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("DAO ownership switch", () => {
    it("switchOwnershipToDao reverts when disabled", async () => {
      await expect(bm.switchOwnershipToDao())
        .to.be.revertedWith("DAO mode disabled");
    });

    it("setDaoSettings and switchOwnershipToDao works", async () => {
      await expect(bm.setDaoSettings(true, governance.address))
        .to.emit(bm, "DaoSettingsUpdated")
        .withArgs(true, governance.address);

      await expect(bm.switchOwnershipToDao())
        .to.emit(bm, "OwnershipSwitchedToDao")
        .withArgs(governance.address);

      expect(await bm.owner()).to.equal(governance.address);
    });
  });

  describe("mint/burn tracking", () => {
    beforeEach(async () => {
      // подготовка: добавляем мост и задаём лимит
      await bm.setBridge(other.address, true);
      await bm.setBridgeInfo(
        other.address,
        true,
        true,
        ethers.ZeroHash,
        100,
        ""
      );
    });

    it("checkAndUpdateBridgeMint increments and enforces limit", async () => {
      await bm.connect(other).checkAndUpdateBridgeMint(90);
      expect(await bm.mintedAmount(other.address)).to.equal(90);

      await expect(
        bm.connect(other).checkAndUpdateBridgeMint(20)
      ).to.be.revertedWith("Bridge mint limit exceeded");
    });

    it("checkAndUpdateBridgeBurn decrements and enforces available", async () => {
      await bm.connect(other).checkAndUpdateBridgeMint(50);
      await bm.connect(other).checkAndUpdateBridgeBurn(30);
      expect(await bm.mintedAmount(other.address)).to.equal(20);

      await expect(
        bm.connect(other).checkAndUpdateBridgeBurn(25)
      ).to.be.revertedWith("Bridge burn: amount exceeds minted");
    });

    it("non-bridge callers cannot mint/burn", async () => {
      await expect(
        bm.connect(owner).checkAndUpdateBridgeMint(1)
      ).to.be.revertedWith("Bridge not present");
      await expect(
        bm.connect(owner).checkAndUpdateBridgeBurn(1)
      ).to.be.revertedWith("Bridge not present");
    });
  });
});
