// test/FeeManager.clampExtremes.test.js
const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("FeeManager – percentage clamp 0 % / 50 %", () => {
  let feeMgr;

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();

    /* ─── dummy ERC20, чтобы конструктору FeeManager было что вызывать ─── */
    const ERC20Mock  = await ethers.getContractFactory("ERC20Mock");
    const dummyToken = await ERC20Mock.deploy(
      "DUM", "DUM", owner.address, 1n        // 1 токен достаточно
    );
    await dummyToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeMgr = await FeeManager.deploy(dummyToken.target);   // ✔️ корректный адрес
    await feeMgr.waitForDeployment();
  });

  it("all discounts → 0 %, whale + baseSellFee 60 % → clamp 50 %", async () => {
    /* === 1. все возможные скидки ⇒ итоговый процент должен обрезаться до 0 === */
    const zero = await feeMgr.calculateFee.staticCall(
      ethers.ZeroAddress,      // _user (игнорируется)
      1_000_000n,              // amount
      false,                   // isBuy  (=> sell)
      true,                    // stakingActive  (‑1 %)
      true,                    // isVIP          (‑2 %)
      false,                   // isWhale
      70n * 24n * 3600n,       // holdingDuration > 60 дней (‑2 %)
      100n                     // nftDiscount ≥ 100 %
    );
    expect(zero).to.equal(0n);

    /* === 2. базовая sell‑fee 60 % + whale‑наценка ⇒ clamp до 50 % === */
    await feeMgr.setBaseSellFee(60);   // > 50 %

    const amount = 100_000n;
    const fee50  = await feeMgr.calculateFee.staticCall(
      ethers.ZeroAddress,
      amount,
      false,   // sell
      false,   // stakingActive
      false,   // VIP
      true,    // whale (+3 %)
      0n,      // holdingDuration
      0n       // nftDiscount
    );
    expect(fee50).to.equal(amount * 50n / 100n);
  });
});
