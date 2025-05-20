const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BridgeManager", function () {
  let deployer, other, BridgeManager, bridge;
  const BRIDGE_TYPE = ethers.encodeBytes32String("L1");

  beforeEach(async () => {
    [deployer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BridgeManager");
    bridge = await Factory.deploy();
    await bridge.setGovernance(other.address, true);
  });

  it("setBridge adds and updates bridge", async () => {
    const addr = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridge(addr, true);
    const info = await bridge.bridges(addr);
    expect(info.trusted).to.be.true;
    expect(info.active).to.be.true;
  });

  it("setBridgeInfo creates new bridge with custom info", async () => {
    const addr = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridgeInfo(addr, true, true, BRIDGE_TYPE, 123456, "test bridge");
    const info = await bridge.bridges(addr);
    expect(info.limit).to.equal(123456);
    expect(info.bridgeType).to.equal(BRIDGE_TYPE);
  });

  it("batchSetBridgeInfo updates multiple bridges", async () => {
    const a1 = ethers.Wallet.createRandom().address;
    const a2 = ethers.Wallet.createRandom().address;
    const arr = [a1, a2];
    const bools = [true, true];
    const types = [BRIDGE_TYPE, BRIDGE_TYPE];
    const limits = [100, 200];
    const descs = ["A", "B"];
    await bridge.connect(other).batchSetBridgeInfo(arr, bools, bools, types, limits, descs);
    const info1 = await bridge.bridges(a1);
    const info2 = await bridge.bridges(a2);
    expect(info1.limit).to.equal(100);
    expect(info2.limit).to.equal(200);
  });

  it("batchSetBridgeInfo reverts on mismatched lengths", async () => {
    const a1 = ethers.Wallet.createRandom().address;
    await expect(
      bridge.connect(other).batchSetBridgeInfo([a1], [true], [true], [BRIDGE_TYPE], [100, 200], ["A"])
    ).to.be.revertedWith("Array length mismatch");
  });

  it("batchSetBridgeInfo reverts on oversized batch", async () => {
    const addrs = Array(51).fill(ethers.Wallet.createRandom().address);
    const bools = Array(51).fill(true);
    const types = Array(51).fill(BRIDGE_TYPE);
    const nums = Array(51).fill(1);
    const descs = Array(51).fill("X");
    await expect(
      bridge.connect(other).batchSetBridgeInfo(addrs, bools, bools, types, nums, descs)
    ).to.be.revertedWith("Batch too large");
  });

  it("removeBridge deletes and swaps from list", async () => {
    const a1 = ethers.Wallet.createRandom().address;
    const a2 = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridge(a1, true);
    await bridge.connect(other).setBridge(a2, true);
    await bridge.connect(other).removeBridge(a1);
    const info = await bridge.bridges(a1);
    expect(info.active).to.equal(false);
    expect(await bridge.mintedAmount(a1)).to.equal(0);
  });

  it("mint/burn updates counters correctly", async () => {
    const a1 = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridge(a1, true);
    await bridge.connect(other).checkAndUpdateBridgeMintBy(a1, 100);
    await bridge.connect(other).checkAndUpdateBridgeBurnBy(a1, 50);
    expect(await bridge.mintedAmount(a1)).to.equal(50);
  });

  it("mint reverts on limit exceeded", async () => {
    const a1 = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridge(a1, true);
    await bridge.connect(other).checkAndUpdateBridgeMintBy(a1, 1_000_000e8);
    await expect(
      bridge.connect(other).checkAndUpdateBridgeMintBy(a1, 1)
    ).to.be.revertedWith("Bridge mint limit exceeded");
  });

  it("burn reverts if exceeds minted", async () => {
    const a1 = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridge(a1, true);
    await expect(
      bridge.connect(other).checkAndUpdateBridgeBurnBy(a1, 10)
    ).to.be.revertedWith("Bridge burn: amount exceeds minted");
  });

  it("pause blocks control ops", async () => {
    const addr = ethers.Wallet.createRandom().address;
    await bridge.connect(other).setBridgePaused(true);
    await expect(bridge.connect(other).setBridge(addr, true)).to.be.revertedWith("Pausable: paused");
  });
});