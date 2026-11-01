// Только чтение: сверяет развёрнутое с журналом, планом и собранными артефактами.
// Сразу после деплоя — как есть. Когда балансы уже двигались: CHECK_MODE=live.
// Любое несовпадение — код выхода 1.
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const fs = require("fs");
const { deploymentsPath, loadPlan } = require("./lib/plan");
const { checkDeployment } = require("./lib/check");

async function main() {
  const file = deploymentsPath(network.name);
  if (!fs.existsSync(file)) throw new Error(`Нет ${file} — деплоя в эту сеть не было`);
  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  if (deployment.status !== "complete") throw new Error(`Деплой в ${file} не завершён: запустите 01-deploy ещё раз`);

  const mode = process.env.CHECK_MODE === "live" ? "live" : "strict";
  const plan = loadPlan(network.name, deployment.deployer);
  const { fails, lines } = await checkDeployment({ ethers, artifacts, deployment, plan, mode });

  console.log(lines.join("\n"));
  if (fails.length) throw new Error(`проверок не прошло: ${fails.length}`);
  console.log(mode === "strict" ? "\nВсё совпадает." : "\nВыпуск и настройки совпадают. Текущие балансы показаны выше.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
