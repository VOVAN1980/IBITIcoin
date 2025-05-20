const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("BridgeManager – burn edge (_bridgeExists false)", () => {
  it("checkAndUpdateBridgeBurnBy reverts for unknown bridge", async () => {
    const [owner, stranger] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("BridgeManager");
    const bm = await Bridge.deploy();
    await expect(
      bm.connect(owner).checkAndUpdateBridgeBurnBy(stranger.address, 1)
    ).to.be.revertedWith("Bridge not present");
  });
});
