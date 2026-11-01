// Настраивает коллекцию и открывает продажу. Подпись — владелец контрактов: в mainnet Ledger Основной, на testnet подписант деплоя.
// Шаги, уже выполненные раньше, пропускаются, поэтому прерванный запуск можно повторить.
// Привязка к стейкингу делается один раз и навсегда: контракт стейкинга поменять её не даст.
// Тестовый стейкинг уже привязан к первой репетиции, поэтому на testnet этот шаг пропускается.
// Без CONFIRM_NFT_SETUP=<chainId> только показывает, что будет сделано.
//   npx hardhat run scripts/10-setup-nft.js --network bscReserve
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");
const { cards } = require("./lib/nft-cards");

const U = (n) => ethers.parseUnits(String(n), 18);

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);
  const prefix = chainId === 56 ? "bsc" : "bscTestnet";
  const dir = path.join(__dirname, "..", "deployments");
  const d = JSON.parse(fs.readFileSync(path.join(dir, `${prefix}.nft.json`), "utf8"));
  const stakingAddress = JSON.parse(fs.readFileSync(path.join(dir, `${prefix}.staking.json`), "utf8")).address;
  if (d.status !== "complete") throw new Error("Деплой NFT не завершён");

  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const nft = await ethers.getContractAt("IBITICollection", d.collection.address, signer);
  const sale = await ethers.getContractAt("IBITINFTSale", d.sale.address, signer);
  const staking = await ethers.getContractAt("IBITIStaking", stakingAddress, signer);

  // На testnet свои маленькие тираж и цены: важна проверка, а не числа
  const list = cards.map((c) => (chainId === 97 ? { ...c, maxSupply: 3, price: c.id } : c));
  const missing = list.filter((c) => !c.maxSupply || !c.price).map((c) => c.name);
  if (missing.length) throw new Error(`Не заданы тираж или цена: ${missing.join(", ")}. Они в scripts/lib/nft-cards.js`);

  const problems = [];
  if ((await nft.owner()) !== me) problems.push(`владелец коллекции ${await nft.owner()}, а подписывает ${me}`);
  if ((await sale.owner()) !== me) problems.push(`владелец продажи ${await sale.owner()}, а подписывает ${me}`);
  if ((await staking.owner()) !== me) problems.push(`владелец стейкинга ${await staking.owner()}, а подписывает ${me}`);
  const bound = await staking.nft();
  if (chainId === 56 && bound !== ethers.ZeroAddress && bound !== d.collection.address) problems.push(`стейкинг уже привязан к ${bound}`);
  const count = Number(await nft.cardCount());
  if (count !== 0 && count !== list.length) problems.push(`в коллекции уже ${count} карточек`);
  if (problems.length) throw new Error(`не настраиваю:\n  - ${problems.join("\n  - ")}`);

  const ids = list.map((c) => c.id);
  const prices = list.map((c) => U(c.price));
  const current = await Promise.all(ids.map((id) => sale.priceOf(id)));

  const steps = [];
  if (count === 0) steps.push(["Добавить карточки", () => nft.addCards(list.map((c) => c.uri), list.map((c) => c.maxSupply))]);
  if (!(await nft.isSeller(d.sale.address))) steps.push(["Разрешить продаже выпуск", () => nft.setSeller(d.sale.address, true)]);
  if (current.some((p, i) => p !== prices[i])) steps.push(["Цены", () => sale.setPrices(ids, prices)]);
  if (!(await nft.isJackpotMinter(stakingAddress))) steps.push(["Разрешить стейкингу выдавать бонус", () => nft.setJackpotMinter(stakingAddress, true)]);
  if (bound === ethers.ZeroAddress) steps.push(["Привязать коллекцию к стейкингу (один раз и навсегда)", () => staking.setNFT(d.collection.address)]);
  if (await sale.paused()) steps.push(["Открыть продажу", () => sale.unpause()]);

  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`Коллекция ${d.collection.address}\nПродажа   ${d.sale.address}\nСтейкинг  ${stakingAddress}\nUSDT идут на ${await sale.reserveWallet()}\n`);
  for (const c of list) console.log(`${String(c.id).padStart(2)}. ${c.name.padEnd(32)} тираж ${String(c.maxSupply).padStart(6)}   ${c.price} USDT`);
  console.log(`\nШаги (${steps.length}):`);
  steps.forEach(([name], i) => console.log(`  ${i + 1}. ${name}`));
  if (!steps.length) {
    console.log("  всё уже настроено");
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

  const [catPrices, , catMax] = await sale.catalog();
  list.forEach((c, i) => {
    if (catPrices[i] !== U(c.price) || catMax[i] !== BigInt(c.maxSupply)) throw new Error(`карточка ${c.id} настроена неверно`);
  });
  if (await sale.paused()) throw new Error("продажа не открылась");
  if (chainId === 56 && (await staking.nft()) !== d.collection.address) throw new Error("стейкинг не привязан");
  console.log("\n✔ Коллекция настроена, продажа открыта");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
