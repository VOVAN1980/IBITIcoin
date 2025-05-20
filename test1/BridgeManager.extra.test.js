const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BridgeManager Extra Coverage", function () {
  let bm, owner, governance, other;

  beforeEach(async () => {
    [owner, governance, other] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy();
    // v6: ждём деплоя
    await bm.waitForDeployment();

    // Включаем governance‑режим
    await bm.connect(owner).setGovernance(governance.address, true);
  });

  it("should allow governance to add bridge when governanceEnabled", async () => {
    const br = ethers.Wallet.createRandom().address;

    await expect(bm.connect(owner).setBridge(br, true))
      .to.be.revertedWith("Only governance");

    await bm.connect(governance).setBridge(br, true);
    expect(await bm.isTrustedBridge(br)).to.be.true;
  });

  it("should emit BridgeInfoUpdated on setBridgeInfo", async () => {
    const br   = ethers.Wallet.createRandom().address;
    // генерим произвольный bytes32
    const tp   = ethers.hexlify(ethers.randomBytes(32));
    const lim  = 777;
    const desc = "test description";

    await expect(
      bm.connect(governance).setBridgeInfo(br, false, true, tp, lim, desc)
    )
      .to.emit(bm, "BridgeInfoUpdated")
      .withArgs(br, tp, lim, desc);

    const info = await bm.bridges(br);
    expect(info.bridgeType).to.equal(tp);
    expect(info.limit).to.equal(lim);
    expect(info.trusted).to.equal(false);
    expect(info.active).to.equal(true);
  });

  it("batchSetBridgeInfo should revert on length mismatch", async () => {
    const br1 = ethers.Wallet.createRandom().address;
    const br2 = ethers.Wallet.createRandom().address;
    const tp1 = ethers.hexlify(ethers.randomBytes(32));
    const tp2 = ethers.hexlify(ethers.randomBytes(32));

    await expect(
      bm.connect(governance).batchSetBridgeInfo(
        [br1, br2],
        [true],           // неверная длина
        [true, true],
        [tp1, tp2],
        [1, 2],
        ["d1", "d2"]
      )
    ).to.be.revertedWith("Array length mismatch");
  });

  it("should switch ownership to DAO wallet", async () => {
    // пока DAO отключён
    await expect(bm.connect(owner).switchOwnershipToDao())
      .to.be.revertedWith("DAO mode disabled");

    // включаем DAO
    await bm.connect(owner).setDaoSettings(true, governance.address);

    await expect(bm.connect(owner).switchOwnershipToDao())
      .to.emit(bm, "OwnershipSwitchedToDao")
      .withArgs(governance.address);

    expect(await bm.owner()).to.equal(governance.address);
  });
});
