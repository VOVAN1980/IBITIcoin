const { expect } = require("chai");
const { ethers } = require("hardhat");
const { formatBytes32String } = require("@ethersproject/strings");

describe("BridgeManager – full coverage", function () {
  let owner, governance, alice, bob;
  let bridgeManager;

  beforeEach(async function () {
    [owner, governance, alice, bob] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    await bridgeManager.waitForDeployment();
  });

  it("reverts setBridge with zero address, when paused, or by non-controller", async function () {
    await expect(
      bridgeManager.setBridge(ethers.ZeroAddress, true)
    ).to.be.revertedWith("Invalid bridge");

    await bridgeManager.setBridgePaused(true);
    await expect(
      bridgeManager.setBridge(alice.address, true)
    ).to.be.revertedWith("Pausable: paused");

    await bridgeManager.setBridgePaused(false);
    await expect(
      bridgeManager.connect(alice).setBridge(bob.address, true)
    ).to.be.revertedWith("Only owner");
  });

  it("adds and updates a bridge correctly", async function () {
    await expect(
      bridgeManager.setBridge(alice.address, true)
    ).to.emit(bridgeManager, "BridgeAdded").withArgs(alice.address);

    await expect(
      bridgeManager.setBridge(alice.address, true)
    ).to.emit(bridgeManager, "BridgeSet").withArgs(alice.address, true, true);
    let info = await bridgeManager.bridges(alice.address);
    expect(info.trusted).to.be.true;
    expect(info.active).to.be.true;

    await expect(
      bridgeManager.setBridge(alice.address, false)
    ).to.emit(bridgeManager, "BridgeSet").withArgs(alice.address, false, false);
    info = await bridgeManager.bridges(alice.address);
    expect(info.trusted).to.be.false;
    expect(info.active).to.be.false;
  });

  it("setBridgeInfo works single and batch with validation", async function () {
  const type = formatBytes32String("TYPE"); // ✅ заменено

  await expect(
    bridgeManager.setBridgeInfo(alice.address, true, true, type, 500, "desc")
  )
    .to.emit(bridgeManager, "BridgeAdded").withArgs(alice.address)
    .and.to.emit(bridgeManager, "BridgeInfoUpdated").withArgs(alice.address, type, 500, "desc");

    const addrs = Array(51).fill(alice.address);
    const flags1 = Array(51).fill(true);
    const flags2 = Array(51).fill(true);
    const typesArr = Array(51).fill(type);
    const limits = Array(51).fill(1);
    const descs = Array(51).fill("x");
    await expect(
      bridgeManager.batchSetBridgeInfo(addrs, flags1, flags2, typesArr, limits, descs)
    ).to.be.revertedWith("Batch too large");

    await expect(
      bridgeManager.batchSetBridgeInfo([alice.address], [], [], [], [], [])
    ).to.be.revertedWith("Array length mismatch");

    await expect(
      bridgeManager.batchSetBridgeInfo(
        [alice.address, bob.address],
        [true, false],
        [true, false],
        [type, type],
        [100, 200],
        ["a", "b"]
      )
    ).to.emit(bridgeManager, "BridgeInfoUpdated");
  });

  it("removeBridge deletes info and reverts when not present or paused", async function () {
    await expect(
      bridgeManager.removeBridge(alice.address)
    ).to.be.revertedWith("Bridge not present");

    await bridgeManager.setBridge(alice.address, true);
    await expect(
      bridgeManager.removeBridge(alice.address)
    ).to.emit(bridgeManager, "BridgeRemoved").withArgs(alice.address);
    const infoDel = await bridgeManager.bridges(alice.address);
    expect(infoDel.trusted).to.be.false;
    expect(infoDel.active).to.be.false;

    await bridgeManager.setBridgePaused(true);
    await expect(
      bridgeManager.removeBridge(owner.address)
    ).to.be.revertedWith("Pausable: paused");
  });

  it("setRouter and setBridgePaused emit events and enforce access", async function () {
    await expect(
      bridgeManager.setRouter(alice.address)
    ).to.emit(bridgeManager, "RouterUpdated").withArgs(ethers.ZeroAddress, alice.address);

    await expect(
      bridgeManager.setBridgePaused(true)
    ).to.emit(bridgeManager, "BridgePaused").withArgs(true);

    await expect(
      bridgeManager.connect(alice).setRouter(owner.address)
    ).to.be.revertedWith("Only owner");
  });

  it("governance and DAO settings and ownership switch", async function () {
    await expect(
      bridgeManager.setGovernance(governance.address, true)
    ).to.emit(bridgeManager, "GovernanceEnabled").withArgs(governance.address, true);

    await expect(
      bridgeManager.setDaoSettings(true, governance.address)
    ).to.emit(bridgeManager, "DaoSettingsUpdated").withArgs(true, governance.address);

    await ethers.provider.send("evm_mine");
    await expect(
      bridgeManager.switchOwnershipToDao()
    ).to.emit(bridgeManager, "OwnershipSwitchedToDao").withArgs(governance.address);
  });

  it("checkAndUpdateBridgeMint/Burn and proxy mint enforce limits and access", async function () {
    await bridgeManager.setBridge(alice.address, true);

    await bridgeManager.connect(alice).checkAndUpdateBridgeMint(100);
    expect(await bridgeManager.mintedAmount(alice.address)).to.equal(100);

    const defaultLimit = (await bridgeManager.bridges(alice.address)).limit;
    await expect(
      bridgeManager.connect(alice).checkAndUpdateBridgeMint(defaultLimit + 1n)
    ).to.be.revertedWith("Bridge mint limit exceeded");

    await expect(
      bridgeManager.connect(alice).checkAndUpdateBridgeBurn(200)
    ).to.be.revertedWith("Bridge burn: amount exceeds minted");

    await bridgeManager.connect(alice).checkAndUpdateBridgeBurn(50);
    expect(await bridgeManager.mintedAmount(alice.address)).to.equal(50);

    await expect(
      bridgeManager.connect(alice).checkAndUpdateBridgeMintBy(bob.address, 10)
    ).to.be.revertedWith("Only owner");
  });
});
