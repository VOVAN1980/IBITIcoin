// Деплой контракта сайта IBITIPromoSale: цена $0,10, бонус 10%, реферал 1 IBITI, лимиты $10–$100.
// Контракт создаётся на паузе. Без CONFIRM_SALE=<chainId> только показывает план.
// Журнал: deployments/<сеть>.promo-sale.json. Повторный деплой поверх запрещён.
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);

  const { RESERVE_WALLET, TESTNET_USDT } = process.env;
  const usdt = chainId === 56 ? BSC_USDT : TESTNET_USDT;
  if (!usdt || !ethers.isAddress(usdt)) throw new Error("Для testnet нужен TESTNET_USDT с 18 знаками");
  if (!RESERVE_WALLET || !ethers.isAddress(RESERVE_WALLET)) throw new Error("В .env нет RESERVE_WALLET");

  const token = JSON.parse(fs.readFileSync(deploymentsPath(network.name), "utf8")).token.address;
  // В mainnet владелец — Ledger Основной. На testnet владелец тот, кто подписывает: так можно проверить управление.
  const owner = chainId === 56 ? ethers.getAddress(RESERVE_WALLET) : me;
  const args = [usdt, token, owner, ethers.getAddress(RESERVE_WALLET), U("0.10").toString(), 1000, I(1).toString(), U(10).toString(), U(100).toString()];

  const erc = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];
  const usdtC = new ethers.Contract(usdt, erc, ethers.provider);
  const tokenC = new ethers.Contract(token, erc, ethers.provider);
  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`USDT   ${usdt} (${await usdtC.symbol()}, ${await usdtC.decimals()} знаков)`);
  console.log(`IBITI  ${token} (${await tokenC.symbol()}, ${await tokenC.decimals()} знаков)`);
  console.log(`Владелец ${owner}\nUSDT идут на ${args[3]}`);
  console.log("Цена $0,10, бонус 10%, реферал 1 IBITI, лимиты $10–$100, старт на паузе");

  const file = path.join(path.dirname(deploymentsPath(network.name)), `${network.name}.promo-sale.json`);
  if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).status === "complete") {
    throw new Error(`Уже есть ${file}: контракт развёрнут`);
  }
  if (process.env.CONFIRM_SALE !== String(chainId)) {
    console.log(`\nЭто только план. Для деплоя: CONFIRM_SALE=${chainId}`);
    return;
  }

  const record = { network: network.name, chainId, deployer: me, status: "incomplete", args, address: null, tx: null };
  const save = () => fs.writeFileSync(file, JSON.stringify(record, null, 2));
  const factory = await ethers.getContractFactory("IBITIPromoSale", signer);
  const sale = await factory.deploy(...args);
  record.tx = sale.deploymentTransaction().hash;
  record.address = await sale.getAddress();
  save(); // журнал до ожидания подтверждения
  await sale.waitForDeployment();

  if (!(await sale.paused())) throw new Error("контракт должен стартовать на паузе");
  if ((await sale.quoteBoughtAmount(U(10))) !== I(100)) throw new Error("10 USDT должны давать 100 IBITI");
  if ((await sale.owner()) !== owner) throw new Error("неверный владелец");
  record.status = "complete";
  save();
  console.log(`\n✔ IBITIPromoSale: ${record.address}\nНа паузе, 10 USDT = 100 IBITI. Журнал: ${file}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
