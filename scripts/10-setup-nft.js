// Настраивает коллекцию и открывает продажу. Подпись — владелец контрактов: в mainnet Ledger Основной, на testnet подписант деплоя.
// Шаги, уже выполненные раньше, пропускаются, поэтому прерванный запуск можно повторить.
// Контракт продажи и цены задаются один раз и навсегда, поэтому пара контрактов, USDT, кошелёк и владелец сверяются до первой подписи.
// Намеренную паузу повторный запуск не снимает.
// Без CONFIRM_NFT_SETUP=<chainId> только показывает, что будет сделано.
// Если настройка прервалась перед открытием продажи: CONFIRM_NFT_OPEN=<chainId> снимает паузу.
//   npx hardhat run scripts/10-setup-nft.js --network bscReserve
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");
const { cards } = require("./lib/nft-cards");
const { setupSteps, checkSetup } = require("./lib/nft-setup");

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);
  const prefix = chainId === 56 ? "bsc" : "bscTestnet";
  const dir = path.join(__dirname, "..", "deployments");
  const d = JSON.parse(fs.readFileSync(path.join(dir, `${prefix}.nft.json`), "utf8"));
  if (d.status !== "complete") throw new Error("Деплой NFT не завершён");

  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const nft = await ethers.getContractAt("IBITICollection", d.collection.address, signer);
  const sale = await ethers.getContractAt("IBITINFTSale", d.sale.address, signer);

  // На testnet свои маленькие тираж и цены: важна проверка, а не числа
  const list = cards.map((c) => (chainId === 97 ? { ...c, maxSupply: 3, price: c.id } : c));
  const missing = list.filter((c) => !c.maxSupply || !c.price).map((c) => c.name);
  if (missing.length) throw new Error(`Не заданы тираж или цена: ${missing.join(", ")}. Они в scripts/lib/nft-cards.js`);

  // Эталон берётся не из журнала: журнал как раз и проверяется
  const { RESERVE_WALLET, TESTNET_USDT } = process.env;
  const usdt = chainId === 56 ? BSC_USDT : TESTNET_USDT;
  if (!usdt || !ethers.isAddress(usdt)) throw new Error("Для testnet нужен TESTNET_USDT с 18 знаками");
  if (!RESERVE_WALLET || !ethers.isAddress(RESERVE_WALLET)) throw new Error("В .env нет RESERVE_WALLET");
  const reserve = ethers.getAddress(RESERVE_WALLET);
  // Подписывать должен владелец: в mainnet это Ledger Основной, на testnet подписант деплоя
  const owner = chainId === 56 ? reserve : me;

  const steps = await setupSteps({ nft, sale, list, owner, usdt, reserve });

  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`Коллекция ${d.collection.address}\nПродажа   ${d.sale.address}\nUSDT идут на ${await sale.reserveWallet()}\n`);
  for (const c of list) console.log(`${String(c.id).padStart(2)}. ${c.name.padEnd(32)} тираж ${String(c.maxSupply).padStart(6)}   ${c.price} USDT`);
  console.log(`\nШаги (${steps.length}):`);
  steps.forEach(([name], i) => console.log(`  ${i + 1}. ${name}`));
  if (!steps.length) {
    console.log("  всё уже настроено");
    const wrong = await checkSetup({ nft, sale, list });
    if (wrong.length) throw new Error(`настроено неверно:\n  - ${wrong.join("\n  - ")}`);
    if (await sale.paused()) {
      if (process.env.CONFIRM_NFT_OPEN !== String(chainId)) {
        console.log(`Продажа на паузе. Снять паузу: CONFIRM_NFT_OPEN=${chainId}`);
        return;
      }
      console.log("Снимаю паузу продажи. Подтвердите на Ledger.");
      const receipt = await (await sale.unpause()).wait();
      console.log(`✔ ${receipt.hash}`);
    }
    return;
  }
  if (process.env.CONFIRM_NFT_SETUP !== String(chainId)) {
    console.log(`\nЭто только показ. Для настройки: CONFIRM_NFT_SETUP=${chainId}`);
    return;
  }

  for (const [i, [name, send]] of steps.entries()) {
    console.log(`\n${i + 1}/${steps.length} ${name}. Подтвердите на Ledger.`);
    const receipt = await (await send()).wait();
    console.log(`✔ ${receipt.hash}`);
  }

  const left = await checkSetup({ nft, sale, list });
  if (await sale.paused()) left.push("продажа не открылась");
  if (left.length) throw new Error(`настроено неверно:\n  - ${left.join("\n  - ")}`);
  console.log("\n✔ Коллекция настроена, продажа открыта");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
