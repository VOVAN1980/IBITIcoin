// test/BridgeManager.removeMiddle.test.js
const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("BridgeManager – _removeBridgeFromList() middle element", () => {
  it("shifts the last bridge into the freed slot (lines 220‑222)", async () => {
    const [owner] = await ethers.getSigners();
    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    const bm = await BridgeManager.deploy();
    await bm.waitForDeployment();

    // two different dummy bridges
    const A = owner.address;
    const B = ethers.Wallet.createRandom().address;

    // add both
    await bm.setBridgeInfo(A, true, true, ethers.ZeroHash, 1, "A");
    await bm.setBridgeInfo(B, true, true, ethers.ZeroHash, 1, "B");

    // remove the first (A) – the contract should move B to index 0
    await bm.removeBridge(A);

    // index 0 now holds B
    expect(await bm.bridgeList(0)).to.equal(B);

    // попытка прочитать элемент с индексом 1 должна revert’ить (список длиной 1)
    await expect(bm.bridgeList(1)).to.be.reverted;
  });
});
