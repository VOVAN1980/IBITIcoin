const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BridgeManager Mint/Burn Coverage", function () {
  let bm, owner, bridge, other;

  beforeEach(async function () {
    [owner, bridge, other] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy(); // сразу развернутый контракт :contentReference[oaicite:0]{index=0}
  });

  it("non-bridge cannot mint or burn", async function () {
    await expect(
      bm.connect(other).checkAndUpdateBridgeMint(1)
    ).to.be.revertedWith("Bridge not present");
    await expect(
      bm.connect(other).checkAndUpdateBridgeBurn(1)
    ).to.be.revertedWith("Bridge not present");
  });

  it("bridge can mint up to limit and then reverts", async function () {
    const ZERO_TYPE = "0x" + "0".repeat(64);

    // ставим лимит 50
    await bm.setBridgeInfo(bridge.address, true, true, ZERO_TYPE, 50, "desc");
    expect(await bm.mintedAmount(bridge.address)).to.equal(0);

    // mint 30
    await bm.connect(bridge).checkAndUpdateBridgeMint(30);
    expect(await bm.mintedAmount(bridge.address)).to.equal(30);

    // mint ещё 20 = ровно лимит
    await bm.connect(bridge).checkAndUpdateBridgeMint(20);
    expect(await bm.mintedAmount(bridge.address)).to.equal(50);

    // попытка превысить лимит
    await expect(
      bm.connect(bridge).checkAndUpdateBridgeMint(1)
    ).to.be.revertedWith("Bridge mint limit exceeded");
  });

  it("bridge can burn up to mintedAmount and then reverts", async function () {
    const ZERO_TYPE = "0x" + "0".repeat(64);

    // ставим лимит 100 и mint 40
    await bm.setBridgeInfo(bridge.address, true, true, ZERO_TYPE, 100, "desc");
    await bm.connect(bridge).checkAndUpdateBridgeMint(40);
    expect(await bm.mintedAmount(bridge.address)).to.equal(40);

    // burn 10 → остаётся 30
    await bm.connect(bridge).checkAndUpdateBridgeBurn(10);
    expect(await bm.mintedAmount(bridge.address)).to.equal(30);

    // попытка сжечь больше, чем чеканили
    await expect(
      bm.connect(bridge).checkAndUpdateBridgeBurn(100)
    ).to.be.revertedWith("Bridge burn: amount exceeds minted");
  });
});
