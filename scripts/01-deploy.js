// Деплой V2: контракт вестинга и токен, который сразу раздаёт весь выпуск.
// Без CONFIRM_DEPLOY=<chainId> только показывает план. Останавливается на первой ошибке.
// Журнал deployments/<сеть>.json пишется по ходу: прерванный деплой продолжается тем же запуском,
// завершённый повторить нельзя.
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const { loadPlan, printPlan, deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");
const { runDeploy, readJournal } = require("./lib/deploy");

async function main() {
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`Сеть: ${network.name} (chainId ${chainId}), деплой с ${me}`);
  const plan = loadPlan(network.name, me);
  printPlan(plan);

  const journalPath = deploymentsPath(network.name);
  const existing = readJournal(journalPath);
  if (existing?.status === "complete") throw new Error(`Уже есть ${journalPath}: деплой в эту сеть завершён. Второй поверх не делаем.`);
  if (existing) console.log(`\nНайден незавершённый журнал ${journalPath}: продолжаю его.`);

  if (process.env.CONFIRM_DEPLOY !== String(chainId)) {
    console.log(`\nЭто только показ плана. Для деплоя: CONFIRM_DEPLOY=${chainId}`);
    return;
  }

  const j = await runDeploy({ ethers, signer, plan, journalPath, network: network.name, chainId });
  console.log(`\n✔ IBITIVesting: ${j.vesting.address}`);
  console.log(`✔ IBITI:        ${j.token.address}`);
  console.log(`Журнал: ${journalPath}`);
  console.log(`Дальше: npx hardhat run scripts/02-post-deploy-check.js --network ${network.name}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
