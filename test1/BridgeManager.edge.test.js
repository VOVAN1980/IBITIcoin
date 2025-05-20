/*  test/BridgeManager.edge.test.js
    Дополнительные ветви BridgeManager                                          */

const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { encodeBytes32String } = ethers;

describe("BridgeManager – edge‑cases & branch coverage", () => {
  let owner, governor, bob, alice;
  let BridgeManager, bridgeM;

  before(async () => {
    [owner, governor, bob, alice] = await ethers.getSigners();
    BridgeManager = await ethers.getContractFactory("BridgeManager");
  });

  beforeEach(async () => {
    bridgeM = await BridgeManager.deploy();
    await bridgeM.waitForDeployment();
  });

  /* ─────────────────── onlyController branches ─────────────────── */

  it("governanceEnabled: owner calling setBridgeInfo → revert; governor succeeds", async () => {
    await bridgeM.setGovernance(governor.address, true);

    // owner (old controller) должен получить revert
    await expect(
      bridgeM.setBridgeInfo(bob.address, true, true, encodeBytes32String("x"), 1, "")
    ).to.be.revertedWith("Only governance");

    // governor может
    await bridgeM.connect(governor).setBridgeInfo(
      bob.address, true, true, encodeBytes32String("x"), 1, "desc"
    );
    const info = await bridgeM.bridges(bob.address);
    expect(info.trusted).to.equal(true);
  });

  it("governanceDisabled: сторонний адрес вызывает removeBridge → revert", async () => {
    // add from owner
    await bridgeM.setBridge(bob.address, true);

    await expect(
      bridgeM.connect(alice).removeBridge(bob.address)
    ).to.be.revertedWith("Only owner");
  });

  /* ─────────────────── batchSetBridgeInfo happy‑path ─────────────────── */

  it("batchSetBridgeInfo устанавливает данные для нескольких мостов", async () => {
    const addrs   = [bob.address, alice.address];
    const trusted = [true, false];
    const active  = [true, false];
    const types   = [encodeBytes32String("L1"), encodeBytes32String("L2")];
    const limits  = [500, 1000];
    const descs   = ["bob‑bridge", "alice‑bridge"];

    await bridgeM.batchSetBridgeInfo(addrs, trusted, active, types, limits, descs);

    const infoBob   = await bridgeM.bridges(bob.address);
    const infoAlice = await bridgeM.bridges(alice.address);

    expect(infoBob.trusted).to.equal(true);
    expect(infoBob.limit).to.equal(500);

    expect(infoAlice.trusted).to.equal(false);
    expect(infoAlice.active).to.equal(false);
    expect(infoAlice.bridgeType).to.equal(types[1]);
  });

  /* ─────────────────── checkAndUpdateBridgeMint / Burn ─────────────────── */

  it("mint выше лимита и burn выше mintedAmount → revert", async () => {
    // настроим мост bob с лимитом 100
    await bridgeM.setBridgeInfo(
      bob.address, true, true, encodeBytes32String("test"), 100, "desc"
    );

    // mint 100 – ок
    await bridgeM.connect(bob).checkAndUpdateBridgeMint(100);

    // превышаем лимит
    await expect(
      bridgeM.connect(bob).checkAndUpdateBridgeMint(1)
    ).to.be.revertedWith("Bridge mint limit exceeded");

    // burn 50 – ok
    await bridgeM.connect(bob).checkAndUpdateBridgeBurn(50);

    // burn ещё 60 – больше, чем осталось (50)
    await expect(
      bridgeM.connect(bob).checkAndUpdateBridgeBurn(60)
    ).to.be.revertedWith("Bridge burn: amount exceeds minted");
  });

  /* ─────────────────── _bridgeExists(false) через isTrustedBridge ─────────────────── */

  it("isTrustedBridge возвращает false для нерегистрированного адреса", async () => {
    expect(await bridgeM.isTrustedBridge(bob.address)).to.equal(false);
  });
});
