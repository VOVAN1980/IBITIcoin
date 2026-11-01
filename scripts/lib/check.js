// Сверка развёрнутого с планом. Режим strict — сразу после деплоя: текущие балансы обязаны совпасть.
// Режим live — после начала работы: балансы уже могут отличаться, а выпуск и настройки сверяются так же.
const { ethers: E } = require("ethers");
const { TOTAL_SUPPLY, DECIMALS } = require("./plan");

const fmt = (x) => E.formatUnits(x, DECIMALS);

async function checkDeployment({ ethers, artifacts, deployment, plan, mode = "strict" }) {
  const fails = [];
  const lines = [];
  const check = (ok, text) => {
    lines.push(`${ok ? "✔" : "✖"} ${text}`);
    if (!ok) fails.push(text);
  };

  const provider = ethers.provider;
  const token = await ethers.getContractAt("IBITI", deployment.token.address);
  const { deployedBytecode } = await artifacts.readArtifact("IBITI");

  check((await provider.getCode(deployment.token.address)) === deployedBytecode, "код токена в сети = код из этого репозитория");
  check((await token.name()) === "IBITIcoin" && (await token.symbol()) === "IBITI", "имя IBITIcoin / IBITI");
  check((await token.decimals()) === BigInt(DECIMALS), `${DECIMALS} знаков`);

  const ownerCall = await provider
    .call({ to: deployment.token.address, data: E.id("owner()").slice(0, 10) })
    .then(() => "ответил", () => "нет");
  check(ownerCall === "нет", "у токена нет owner()");

  // Что реально выпущено — по событиям транзакции деплоя, это не меняется со временем.
  const receipt = deployment.token.tx ? await provider.getTransactionReceipt(deployment.token.tx) : null;
  check(receipt?.status === 1, "транзакция выпуска токена прошла");
  const minted = new Map();
  for (const log of receipt?.logs ?? []) {
    const parsed = token.interface.parseLog(log);
    if (parsed?.name === "Transfer" && parsed.args.from === E.ZeroAddress) {
      minted.set(parsed.args.to, (minted.get(parsed.args.to) || 0n) + parsed.args.value);
    }
  }
  // На один адрес может приходиться несколько долей (на testnet — так и есть)
  const expectedByAddress = new Map();
  for (const a of deployment.distribution) {
    expectedByAddress.set(a.to, (expectedByAddress.get(a.to) || 0n) + BigInt(a.amount));
  }
  const mintedTotal = [...minted.values()].reduce((s, x) => s + x, 0n);
  check(mintedTotal === TOTAL_SUPPLY, `выпущено ровно 100 000 000 (по событиям: ${fmt(mintedTotal)})`);

  for (const [to, amount] of expectedByAddress) {
    const labels = deployment.distribution.filter((a) => a.to === to).map((a) => a.label).join(" + ");
    check(minted.get(to) === amount, `${labels}: выпущено ${fmt(amount)} на ${to}`);
  }

  // Журнал должен соответствовать утверждённому плану (конфиг могли поменять).
  const planned = plan.distribution;
  const sameCount = planned.length === deployment.distribution.length;
  check(sameCount, "число получателей совпадает с планом");
  if (sameCount) {
    planned.forEach((p, i) => {
      const d = deployment.distribution[i];
      const sameTo = p.role === "vesting" ? d.to === deployment.vesting.address : p.to === d.to;
      check(sameTo && p.amount === BigInt(d.amount), `план: ${p.label} = ${fmt(p.amount)}`);
    });
  }

  const vesting = await ethers.getContractAt("IBITIVesting", deployment.vesting.address);
  const [tokenAddr, owner, allocation, start] = deployment.vesting.args;
  const released = await vesting.released();
  check((await vesting.token()) === deployment.token.address, "вестинг привязан к этому токену");
  check((await vesting.totalAllocation()) === BigInt(allocation), `вестинг: доля ${fmt(allocation)}`);
  check((await vesting.start()) === BigInt(start), `вестинг: старт ${new Date(Number(start) * 1000).toISOString()}`);
  check(tokenAddr === deployment.token.address, "журнал вестинга указывает на этот токен");
  check(
    (await token.balanceOf(deployment.vesting.address)) === BigInt(allocation) - released,
    "на вестинге ровно доля минус выданное"
  );
  check(
    (await vesting.unlockedAt(Number(start))) === (BigInt(allocation) * 20n) / 100n,
    "график: на старте открыто 20%"
  );

  if (mode === "strict") {
    check((await vesting.owner()) === owner, `вестинг: владелец ${owner}`);
    check((await token.totalSupply()) === TOTAL_SUPPLY, "в обращении ровно 100 000 000");
    for (const [to, amount] of expectedByAddress) {
      const labels = deployment.distribution.filter((a) => a.to === to).map((a) => a.label).join(" + ");
      const bal = await token.balanceOf(to);
      check(bal === amount, `${labels}: сейчас на адресе ${fmt(bal)}`);
    }
  } else {
    lines.push(`  владелец вестинга сейчас: ${await vesting.owner()}, выдано: ${fmt(released)}`);
    lines.push(`  в обращении сейчас: ${fmt(await token.totalSupply())}`);
    for (const [to, amount] of expectedByAddress) {
      const labels = deployment.distribution.filter((a) => a.to === to).map((a) => a.label).join(" + ");
      lines.push(`  ${labels}: сейчас ${fmt(await token.balanceOf(to))} (выпущено ${fmt(amount)})`);
    }
  }

  return { fails, lines };
}

module.exports = { checkDeployment };
