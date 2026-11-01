const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers, artifacts } = require("hardhat");
const { loadPlan, DECIMALS } = require("../scripts/lib/plan");
const { runDeploy } = require("../scripts/lib/deploy");
const { checkDeployment } = require("../scripts/lib/check");

const E = (n) => ethers.parseUnits(String(n), DECIMALS);
const hasCode = async (a) => (await ethers.provider.getCode(a)) !== "0x";

describe("Деплой и проверка после деплоя", function () {
  let dir, journalPath, signer, plan, n = 0;

  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibiti-deploy-")); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  beforeEach(async () => {
    [signer] = await ethers.getSigners();
    plan = loadPlan("localhost", signer.address);
    journalPath = path.join(dir, `journal-${n++}.json`);
  });

  const deploy = (extra = {}) =>
    runDeploy({ ethers, signer, plan, journalPath, network: "hardhat", chainId: 31337n, ...extra });
  const read = () => JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const check = (deployment, mode, p = plan) => checkDeployment({ ethers, artifacts, deployment, plan: p, mode });
  const stopAfterVesting = async () => { throw new Error("обрыв"); };

  it("полный деплой: токен по заранее известному адресу, 10 млн сразу на вестинге, всё совпадает", async () => {
    const j = await deploy();
    expect(j.status).to.equal("complete");
    const token = await ethers.getContractAt("IBITI", j.token.address);
    const vesting = await ethers.getContractAt("IBITIVesting", j.vesting.address);
    expect(await vesting.token()).to.equal(j.token.address);
    expect(await token.balanceOf(j.vesting.address)).to.equal(E(10_000_000));
    expect(await token.balanceOf(signer.address)).to.equal(E(70_000_000));
    expect(await vesting.owner()).to.equal(plan.vesting.owner);

    const { fails } = await check(j);
    expect(fails).to.deep.equal([]);
  });

  it("завершённый деплой повторить нельзя", async () => {
    await deploy();
    await expect(deploy()).to.be.rejectedWith(/деплой завершён/);
  });

  it("обрыв после вестинга: запуск продолжает, второй вестинг не создаётся, адреса те же", async () => {
    await expect(deploy({ onStep: stopAfterVesting })).to.be.rejectedWith("обрыв");
    const before = read();
    expect(before.status).to.equal("incomplete");
    expect(before.vesting.tx).to.not.equal(null);
    expect(await hasCode(before.vesting.address)).to.equal(true);
    expect(await hasCode(before.token.address)).to.equal(false);

    const j = await deploy();
    expect(j.status).to.equal("complete");
    expect(j.vesting.address).to.equal(before.vesting.address);
    expect(j.vesting.tx).to.equal(before.vesting.tx);
    expect((await check(j)).fails).to.deep.equal([]);
  });

  it("обрыв сразу после отправки, хэш не записан: контракт находится по адресу, деплой продолжается", async () => {
    await expect(deploy({ onStep: stopAfterVesting })).to.be.rejectedWith("обрыв");
    const lost = read();
    lost.vesting.tx = null;
    fs.writeFileSync(journalPath, JSON.stringify(lost));

    const j = await deploy();
    expect(j.status).to.equal("complete");
    expect((await check(j)).fails).to.deep.equal([]);
  });

  it("кошелёк отправил другую транзакцию между шагами: отказ, токен не выпущен", async () => {
    await expect(deploy({ onStep: stopAfterVesting })).to.be.rejectedWith("обрыв");
    const { token } = read();
    await signer.sendTransaction({ to: signer.address, value: 0 });

    await expect(deploy()).to.be.rejectedWith(/другие транзакции/);
    expect(await hasCode(token.address)).to.equal(false);
  });

  it("проверка не пишет «совпадает», если баланс уже другой (строгий режим); в режиме live показывает", async () => {
    const j = await deploy();
    const token = await ethers.getContractAt("IBITI", j.token.address);
    await token.transfer("0x000000000000000000000000000000000000dEaD", 1n);

    const strict = await check(j, "strict");
    expect(strict.fails.join(" ")).to.contain("Ликвидность");

    const live = await check(j, "live");
    expect(live.fails).to.deep.equal([]);
    expect(live.lines.join("\n")).to.contain("сейчас");
  });

  it("проверка ловит расхождение с планом, даже если выпуск прошёл как записано", async () => {
    const j = await deploy();
    const wrong = {
      ...plan,
      distribution: plan.distribution.map((a) => (a.role === "liquidity" ? { ...a, amount: a.amount - 1n } : a)),
    };
    const { fails } = await check(j, "strict", wrong);
    expect(fails.join(" ")).to.contain("план");
  });

  it("проверка ловит другого владельца вестинга в строгом режиме", async () => {
    const j = await deploy();
    const tampered = JSON.parse(JSON.stringify(j));
    tampered.vesting.args[1] = signer.address;
    const { fails } = await check(tampered);
    expect(fails.join(" ")).to.contain("владелец");
  });

  it("две доли на один адрес (как на testnet): проверка складывает их и проходит", async () => {
    const p = loadPlan("bscTestnet", signer.address);
    const j = await runDeploy({ ethers, signer, plan: p, journalPath, network: "hardhat", chainId: 31337n });
    const { fails } = await check(j, "strict", p);
    expect(fails).to.deep.equal([]);
    const token = await ethers.getContractAt("IBITI", j.token.address);
    expect(await token.balanceOf(signer.address)).to.equal(E(90_000_000));
  });

  it("выпуск записан с держателями: они получают сразу, сумма 100 млн", async () => {
    const j = await deploy();
    const token = await ethers.getContractAt("IBITI", j.token.address);
    for (const h of plan.holders) expect(await token.balanceOf(h.to)).to.equal(h.amount);
    expect(plan.holders.length).to.equal(2);
    const marketing = j.distribution.find((a) => a.role === "marketing");
    expect(BigInt(marketing.amount)).to.equal(E(20_000_000) - plan.holdersTotal);
    expect(await token.totalSupply()).to.equal(E(100_000_000));
  });
});
