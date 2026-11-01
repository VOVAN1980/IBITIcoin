const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("hardhat");
const { loadPlan, configPath, DECIMALS } = require("../scripts/lib/plan");

const E = (n) => ethers.parseUnits(String(n), DECIMALS);
const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const C = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const D = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

const config = (over = {}) => ({
  allocations: [
    { role: "liquidity", label: "Ликвидность", to: A, amount: "70000000" },
    { role: "marketing", label: "Маркетинг", to: B, amount: "20000000" },
    { role: "vesting", label: "Вестинг", amount: "10000000", vesting: { owner: C, startDate: "DEPLOY" } },
  ],
  holders: { status: "CONFIRMED", list: [] },
  ...over,
});

describe("План распределения 70 / 20 / 10", function () {
  let dir, n = 0;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibiti-plan-")); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const load = (cfg) => {
    const file = path.join(dir, `tokenomics.${n++}.json`);
    fs.writeFileSync(file, JSON.stringify(cfg));
    return loadPlan("test", A, file);
  };

  it("правильный план: 70 + 20 + 10 = 100 млн", () => {
    const p = load(config());
    const total = p.distribution.reduce((s, x) => s + x.amount, 0n);
    expect(total).to.equal(E(100_000_000));
    expect(p.vesting.amount).to.equal(E(10_000_000));
    expect(p.vesting.owner).to.equal(C);
  });

  it("держатели получают из 20 млн, общий выпуск не растёт", () => {
    const p = load(config({ holders: { status: "CONFIRMED", list: [{ to: D, amount: "88.57806041" }] } }));
    const marketing = p.distribution.find((x) => x.role === "marketing");
    expect(marketing.amount).to.equal(E(20_000_000) - E("88.57806041"));
    expect(p.distribution.find((x) => x.role === "holder").amount).to.equal(E("88.57806041"));
    expect(p.distribution.reduce((s, x) => s + x.amount, 0n)).to.equal(E(100_000_000));
  });

  it("сумма 100 млн при неправильных долях не проходит", () => {
    const cfg = config();
    cfg.allocations[0].amount = "80000000";
    cfg.allocations[1].amount = "10000000";
    expect(() => load(cfg)).to.throw(/роль "liquidity"[\s\S]*роль "marketing"/);
  });

  it("неподтверждённый список держателей не проходит", () => {
    expect(() => load(config({ holders: { status: "НЕ ПОДТВЕРЖДЕНО", list: [] } }))).to.throw(/не подтверждён/);
    expect(() => load(config({ holders: undefined }))).to.throw(/не подтверждён/);
  });

  it("плохие адреса, суммы и дубли называются все сразу", () => {
    const cfg = config({ holders: { status: "CONFIRMED", list: [{ to: D, amount: "1" }, { to: D, amount: "0" }] } });
    cfg.allocations[0].to = "FILL";
    cfg.allocations[2].vesting.owner = "FILL";
    cfg.allocations[2].vesting.startDate = "завтра";
    expect(() => load(cfg)).to.throw(/allocations\[0\][\s\S]*owner[\s\S]*startDate[\s\S]*дважды[\s\S]*holders\[1\]/);
  });

  it("второй вестинг или неизвестная роль не проходят", () => {
    const two = config();
    two.allocations.push({ role: "vesting", label: "Ещё", amount: "1", vesting: { owner: C, startDate: "DEPLOY" } });
    expect(() => load(two)).to.throw(/роль "vesting": нужна ровно одна/);

    const unknown = config();
    unknown.allocations.push({ role: "другое", label: "?", to: D, amount: "1" });
    expect(() => load(unknown)).to.throw(/неизвестная роль/);
  });

  it("настоящий конфиг mainnet: 70 / 20 / 10, адреса верные, деплой закрыт до подтверждения держателей", () => {
    const cfg = JSON.parse(fs.readFileSync(configPath("bsc"), "utf8"));
    const [liq, mkt, ves] = cfg.allocations;
    expect([liq.role, liq.amount, liq.to]).to.deep.equal(["liquidity", "70000000", "0xC00dC8E3F4647AAa4791AE58901eDDFE6095adA5"]);
    expect([mkt.role, mkt.amount, mkt.to]).to.deep.equal(["marketing", "20000000", "0x9d8dd8B2CFF7A17967fA0eF19eD5C0b3EBeFDe41"]);
    expect([ves.role, ves.amount, ves.vesting.owner]).to.deep.equal(["vesting", "10000000", "0x1841DE9b1c8bF5244675896b0F4FF96C9331596f"]);

    const confirmed = { ...cfg, holders: { ...cfg.holders, status: "CONFIRMED" } };
    const p = load(confirmed);
    expect(p.distribution.reduce((s, x) => s + x.amount, 0n)).to.equal(E(100_000_000));
    if (cfg.holders.status !== "CONFIRMED") expect(() => loadPlan("bsc", A)).to.throw(/не подтверждён/);
  });
});
