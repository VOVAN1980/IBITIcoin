const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BridgeManager Mint/Burn Coverage", function () {
  let bm, owner, bridge, other;

  beforeEach(async () => {
    [owner, bridge, other] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy();
    // Не нужно ждать .deployed() — deploy возвращает уже развернутый контракт
  });

  it("non-bridge cannot mint or burn", async () => {
    await expect(
      bm.connect(other).checkAndUpdateBridgeMint(1)
    ).to.be.revertedWith("Bridge not present");
    await expect(
      bm.connect(other).checkAndUpdateBridgeBurn(1)
    ).to.be.revertedWith("Bridge not present");
  });

  it("bridge can mint up to limit and then reverts", async () => {
    const limit = 3;
    const ZERO32 = ethers.ZeroHash;

    // Регистрируем мост с лимитом
    await bm.setBridgeInfo(bridge.address, true, true, ZERO32, limit, "desc");

    // Чеканим до предела
    for (let i = 0; i < limit; i++) {
      await bm.connect(bridge).checkAndUpdateBridgeMint(1);
    }
    // Следующая попытка должна упасть
    await expect(
      bm.connect(bridge).checkAndUpdateBridgeMint(1)
    ).to.be.revertedWith("Bridge mint limit exceeded");
  });

  it("bridge can burn up to mintedAmount and then reverts", async () => {
    const limit = 3;
    const ZERO32 = ethers.ZeroHash;

    // Регистрируем мост и чеканим до предела
    await bm.setBridgeInfo(bridge.address, true, true, ZERO32, limit, "desc");
    for (let i = 0; i < limit; i++) {
      await bm.connect(bridge).checkAndUpdateBridgeMint(1);
    }

    // Сжигаем до нуля
    for (let i = 0; i < limit; i++) {
      await bm.connect(bridge).checkAndUpdateBridgeBurn(1);
    }
    // Следующая попытка должна упасть
    await expect(
      bm.connect(bridge).checkAndUpdateBridgeBurn(1)
    ).to.be.revertedWith("Bridge burn: amount exceeds minted");
  });
});
