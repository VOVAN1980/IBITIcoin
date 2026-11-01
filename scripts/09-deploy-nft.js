// Деплой коллекции IBITICollection и продажи IBITINFTSale. Карточек нет, продажа на паузе: всё включает 10-setup-nft.js.
// Без CONFIRM_NFT=<chainId> только показывает план. Журнал: deployments/<сеть>.nft.json. Повторный деплой поверх запрещён.
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

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
  const reserve = ethers.getAddress(RESERVE_WALLET);
  // В mainnet владелец — Ledger Основной. На testnet владелец тот, кто подписывает: так можно проверить управление.
  const owner = chainId === 56 ? reserve : me;

  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`Владелец ${owner}\nUSDT ${usdt}, идут на ${reserve}\nПроцент с перепродаж 5%, идёт на ${reserve}`);

  const file = path.join(path.dirname(deploymentsPath(network.name)), `${network.name}.nft.json`);
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (prev && prev.status === "complete") throw new Error(`Уже есть ${file}: контракты развёрнуты`);
  if (process.env.CONFIRM_NFT !== String(chainId)) {
    console.log(`\nЭто только план. Для деплоя: CONFIRM_NFT=${chainId}`);
    return;
  }

  const record = prev || { network: network.name, chainId, deployer: me, status: "incomplete", owner, usdt, reserve, collection: null, sale: null };
  const save = () => fs.writeFileSync(file, JSON.stringify(record, null, 2));

  // Прерванный деплой продолжается с того контракта, которого ещё нет
  if (!record.collection) {
    const args = [owner, reserve];
    const nft = await (await ethers.getContractFactory("IBITICollection", signer)).deploy(...args);
    record.collection = { address: await nft.getAddress(), tx: nft.deploymentTransaction().hash, args };
    save();
    await nft.waitForDeployment();
  }
  if (!record.sale) {
    const args = [usdt, record.collection.address, owner, reserve];
    const sale = await (await ethers.getContractFactory("IBITINFTSale", signer)).deploy(...args);
    record.sale = { address: await sale.getAddress(), tx: sale.deploymentTransaction().hash, args };
    save();
    await sale.waitForDeployment();
  }

  const nft = await ethers.getContractAt("IBITICollection", record.collection.address);
  const sale = await ethers.getContractAt("IBITINFTSale", record.sale.address);
  if ((await nft.owner()) !== owner || (await sale.owner()) !== owner) throw new Error("неверный владелец");
  if ((await nft.lastTokenId()) !== 0n || (await nft.cardCount()) !== 0n) throw new Error("коллекция должна быть пустой");
  if (!(await sale.paused())) throw new Error("продажа должна быть на паузе");
  if ((await sale.reserveWallet()) !== reserve) throw new Error("неверный кошелёк для USDT");
  const [royaltyTo, royalty] = await nft.royaltyInfo(1, 10_000);
  if (royaltyTo !== reserve || royalty !== 500n) throw new Error("неверный процент с перепродаж");
  record.status = "complete";
  save();
  console.log(`\n✔ IBITICollection: ${record.collection.address}\n✔ IBITINFTSale:    ${record.sale.address}\nЖурнал: ${file}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
