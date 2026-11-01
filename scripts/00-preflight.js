// Только чтение: сеть, кошелёк деплоя, план распределения, проверка адресов. Ничего не отправляет.
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const { loadPlan, printPlan, deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

async function main() {
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const { chainId } = await ethers.provider.getNetwork();
  const bnb = await ethers.provider.getBalance(me);

  console.log(`Сеть: ${network.name} (chainId ${chainId})`);
  console.log(`Деплой с: ${me}  баланс ${ethers.formatEther(bnb)} BNB`);

  const plan = loadPlan(network.name, me);
  printPlan(plan);

  console.log("\nАдреса получателей:");
  for (const a of plan.distribution) {
    const addr = a.role === "vesting" ? a.owner : a.to;
    const isContract = (await ethers.provider.getCode(addr)) !== "0x";
    console.log(`  ${addr}  ${isContract ? "контракт" : "кошелёк"}  — ${a.label}${a.role === "vesting" ? " (владелец)" : ""}`);
  }

  const warnings = [];
  if (bnb === 0n) warnings.push("на кошельке деплоя 0 BNB — оплатить газ нечем");
  if (fs.existsSync(deploymentsPath(network.name))) warnings.push(`уже есть журнал ${deploymentsPath(network.name)}`);
  if (warnings.length) console.log(`\n⚠ ${warnings.join("\n⚠ ")}`);

  console.log(`\nПлан проверен. Деплой: CONFIRM_DEPLOY=${chainId} npx hardhat run scripts/01-deploy.js --network ${network.name}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
