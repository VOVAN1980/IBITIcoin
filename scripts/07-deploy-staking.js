// Деплой стейкинга IBITIStaking: минимальный вклад 100 IBITI, окно после срока 30 дней.
// Контракт создаётся на паузе. Без CONFIRM_STAKING=<chainId> только показывает план.
// Журнал: deployments/<сеть>.staking.json. Повторный деплой поверх запрещён.
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

const I = (n) => ethers.parseUnits(String(n), 8);

async function main() {
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);

  const { RESERVE_WALLET } = process.env;
  if (!RESERVE_WALLET || !ethers.isAddress(RESERVE_WALLET)) throw new Error("В .env нет RESERVE_WALLET");

  const token = JSON.parse(fs.readFileSync(deploymentsPath(network.name), "utf8")).token.address;
  // В mainnet владелец — Ledger Основной. На testnet владелец тот, кто подписывает: так можно проверить управление.
  const owner = chainId === 56 ? ethers.getAddress(RESERVE_WALLET) : me;
  const args = [token, owner, I(100).toString()];

  const tokenC = new ethers.Contract(token, ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], ethers.provider);
  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`IBITI  ${token} (${await tokenC.symbol()}, ${await tokenC.decimals()} знаков)`);
  console.log(`Владелец ${owner}`);
  console.log("Минимальный вклад 100 IBITI, окно 30 дней, старт на паузе");

  const file = path.join(path.dirname(deploymentsPath(network.name)), `${network.name}.staking.json`);
  if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).status === "complete") {
    throw new Error(`Уже есть ${file}: контракт развёрнут`);
  }
  if (process.env.CONFIRM_STAKING !== String(chainId)) {
    console.log(`\nЭто только план. Для деплоя: CONFIRM_STAKING=${chainId}`);
    return;
  }

  const record = { network: network.name, chainId, deployer: me, status: "incomplete", args, address: null, tx: null };
  const save = () => fs.writeFileSync(file, JSON.stringify(record, null, 2));
  const factory = await ethers.getContractFactory("IBITIStaking", signer);
  const staking = await factory.deploy(...args);
  record.tx = staking.deploymentTransaction().hash;
  record.address = await staking.getAddress();
  save(); // журнал до ожидания подтверждения
  await staking.waitForDeployment();

  if (!(await staking.paused())) throw new Error("контракт должен стартовать на паузе");
  if ((await staking.owner()) !== owner) throw new Error("неверный владелец");
  if ((await staking.token()) !== token) throw new Error("неверный токен");
  if ((await staking.quoteReward(I(1_000), 12)) !== I(300)) throw new Error("1 000 IBITI на 12 месяцев должны давать 300");
  record.status = "complete";
  save();
  console.log(`\n✔ IBITIStaking: ${record.address}\nНа паузе, 1 000 IBITI на 12 месяцев = 300 награды. Журнал: ${file}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
