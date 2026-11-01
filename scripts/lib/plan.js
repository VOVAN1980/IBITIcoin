// План деплоя из config/tokenomics.<сеть>.json.
// Все проблемы конфига собираются в один список — деплой не начнётся, пока есть хоть одна.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const DECIMALS = 8;
const unit = (n) => ethers.parseUnits(String(n), DECIMALS);
const TOTAL_SUPPLY = unit(100_000_000);
// Доли утверждены: сумма 100 млн сама по себе не отличит неправильное деление.
const SHARES = { liquidity: unit(70_000_000), marketing: unit(20_000_000), vesting: unit(10_000_000) };

function configPath(networkName) {
  return path.join(__dirname, "..", "..", "config", `tokenomics.${networkName}.json`);
}

function deploymentsPath(networkName) {
  return path.join(__dirname, "..", "..", "deployments", `${networkName}.json`);
}

function loadPlan(networkName, deployerAddress, file = configPath(networkName)) {
  if (!fs.existsSync(file)) throw new Error(`Нет конфига ${file}`);
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  const problems = [];

  const address = (value, where) => {
    if (value === "DEPLOYER") return deployerAddress;
    if (typeof value !== "string" || !ethers.isAddress(value) || BigInt(value) === 0n) {
      problems.push(`${where}: нужен адрес, сейчас "${value}"`);
      return null;
    }
    return ethers.getAddress(value);
  };
  const amountOf = (value, where) => {
    try {
      const a = unit(value);
      if (a > 0n) return a;
    } catch {}
    problems.push(`${where}: нужно количество IBITI > 0, сейчас "${value}"`);
    return 0n;
  };

  const allocations = (cfg.allocations || []).map((a, i) => {
    const where = `allocations[${i}] "${a.label}"`;
    if (!SHARES[a.role]) problems.push(`${where}: неизвестная роль "${a.role}"`);
    const amount = amountOf(a.amount, `${where}.amount`);
    if (a.role !== "vesting") return { role: a.role, label: a.label, amount, to: address(a.to, `${where}.to`) };

    const v = a.vesting || {};
    const owner = address(v.owner, `${where}.vesting.owner`);
    const startMs = v.startDate === "DEPLOY" ? null : Date.parse(v.startDate);
    if (Number.isNaN(startMs)) {
      problems.push(`${where}.vesting.startDate: нужно DEPLOY или дата вида 2027-01-01T00:00:00Z, сейчас "${v.startDate}"`);
    }
    return {
      role: a.role, label: a.label, amount, owner,
      startDate: v.startDate,
      start: startMs === null ? null : Math.floor(startMs / 1000),
    };
  });

  for (const role of Object.keys(SHARES)) {
    const entries = allocations.filter((a) => a.role === role);
    if (entries.length !== 1) problems.push(`роль "${role}": нужна ровно одна запись, сейчас ${entries.length}`);
    else if (entries[0].amount !== SHARES[role]) {
      problems.push(`роль "${role}": должно быть ${ethers.formatUnits(SHARES[role], DECIMALS)} IBITI, сейчас ${ethers.formatUnits(entries[0].amount, DECIMALS)}`);
    }
  }

  const h = cfg.holders || {};
  if (h.status !== "CONFIRMED") problems.push(`список держателей V1 не подтверждён (holders.status = "${h.status}")`);
  const seen = new Set();
  const holders = (h.list || []).map((x, i) => {
    const to = address(x.to, `holders[${i}].to`);
    if (to && seen.has(to)) problems.push(`holders[${i}]: адрес ${to} встречается дважды`);
    seen.add(to);
    return { role: "holder", label: "Держатель V1", to, amount: amountOf(x.amount, `holders[${i}].amount`) };
  });
  const holdersTotal = holders.reduce((s, x) => s + x.amount, 0n);

  if (problems.length) throw new Error(`Конфиг ${path.basename(file)} не готов:\n  - ${problems.join("\n  - ")}`);

  // Держатели получают из доли маркетинга; вестинг получит адрес при деплое.
  const distribution = [
    ...allocations.map((a) => (a.role === "marketing" ? { ...a, amount: a.amount - holdersTotal } : a)),
    ...holders,
  ];
  return { file, distribution, holders, holdersTotal, vesting: allocations.find((a) => a.role === "vesting") };
}

function printPlan(plan) {
  console.log(`\nРаспределение 100 000 000 IBITI (${path.basename(plan.file)}):`);
  for (const a of plan.distribution) {
    const amount = ethers.formatUnits(a.amount, DECIMALS);
    if (a.role === "vesting") {
      console.log(`  ${amount.padStart(18)}  ${a.label} → контракт вестинга, владелец ${a.owner}, старт ${a.startDate}`);
    } else {
      console.log(`  ${amount.padStart(18)}  ${a.label} → ${a.to}`);
    }
  }
}

module.exports = { loadPlan, printPlan, configPath, deploymentsPath, TOTAL_SUPPLY, SHARES, DECIMALS };
