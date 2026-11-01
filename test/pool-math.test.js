const { expect } = require("chai");
const { ethers } = require("hardhat");
const { usdtForIbiti, impliedPrice } = require("../scripts/lib/pool-math");

// Правило после слива V1: любую цену проверяем числами 1 / 1 000 / 1 000 000
// и для всех сочетаний знаков (6 / 8 / 18).
describe("Цена пула: 1 / 1 000 / 1 000 000 IBITI при $0.10", function () {
  const cases = [
    { ibitiDec: 8, usdtDec: 18, note: "IBITI + настоящий BSC-USDT" },
    { ibitiDec: 8, usdtDec: 8, note: "тестовый mUSDT с 8 знаками (ловушка testnet)" },
    { ibitiDec: 8, usdtDec: 6, note: "6-знаковый стейблкоин" },
  ];

  for (const { ibitiDec, usdtDec, note } of cases) {
    it(`${note}: ${ibitiDec}/${usdtDec} знаков`, () => {
      const expected = { 1: "0.1", 1000: "100.0", 1000000: "100000.0" };
      for (const n of [1, 1_000, 1_000_000]) {
        const ibiti = ethers.parseUnits(String(n), ibitiDec);
        const usdt = usdtForIbiti(ibiti, "0.10", ibitiDec, usdtDec);
        expect(ethers.formatUnits(usdt, usdtDec)).to.equal(expected[n]);
        expect(impliedPrice(ibiti, usdt, ibitiDec, usdtDec)).to.equal("0.1");
      }
    });
  }

  it("формула V1 на тех же числах дала бы ~0 — тест её ловит", () => {
    const ibiti = ethers.parseUnits("1000000", 8);
    const v1Cost = (100_000n * ibiti) / 10n ** 18n; // IBITIcoin.sol:459 (V1)
    const right = usdtForIbiti(ibiti, "0.10", 8, 18);
    expect(v1Cost).to.equal(10n);
    expect(right).to.equal(ethers.parseUnits("100000", 18));
  });
});
