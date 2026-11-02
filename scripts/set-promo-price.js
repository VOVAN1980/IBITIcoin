// Меняет цену продажи на сайте: пауза, новая цена, снятие паузы. Подпись — владелец контракта: в mainnet Ledger Основной.
// Цена на сайте = реальная цена × 1.1: с бонусом 10% покупка выходит по цене пула и перекупа нет.
// Намеренную паузу не снимает. Если замена прервалась на паузе, повторить с PROMO_OPEN=1.
// Без CONFIRM_PROMO_PRICE=<chainId> только показывает.
//   PROMO_PRICE=0.11 npx hardhat run scripts/set-promo-price.js --network bscReserve
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");

const f8 = (x) => ethers.formatUnits(x, 8);

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);
  const prefix = chainId === 56 ? "bsc" : "bscTestnet";
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${prefix}.promo-sale.json`), "utf8"));

  const { PROMO_PRICE, PROMO_OPEN } = process.env;
  if (!PROMO_PRICE) throw new Error("Укажите PROMO_PRICE, например 0.11");
  const price = ethers.parseEther(PROMO_PRICE);

  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const sale = await ethers.getContractAt("IBITIPromoSale", d.address, signer);
  if ((await sale.owner()) !== me) throw new Error(`владелец ${await sale.owner()}, а подписывает ${me}`);
  if (price < (await sale.MIN_PRICE()) || price > (await sale.MAX_PRICE())) throw new Error(`цена ${PROMO_PRICE} вне допустимых границ контракта`);

  const current = await sale.price();
  const wasPaused = await sale.paused();
  const bonus = await sale.bonusBps();
  const effective = (x) => ethers.formatEther((x * 10_000n) / (10_000n + bonus));
  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`Контракт ${d.address}, пауза ${wasPaused}, запас ${f8(await sale.poolRemaining())} IBITI, продано ${f8(await sale.soldTotal())}`);
  console.log(`Сейчас ${ethers.formatEther(current)} USDT, с бонусом ${effective(current)}`);
  console.log(`Будет  ${ethers.formatEther(price)} USDT, с бонусом ${effective(price)}`);

  const open = PROMO_OPEN === "1" || !wasPaused;
  const steps = [];
  if (current !== price) {
    if (!wasPaused) steps.push(["Пауза продажи", () => sale.pause()]);
    steps.push([`Новая цена ${PROMO_PRICE} USDT`, () => sale.setPrice(price)]);
  }
  if (open && (wasPaused || current !== price)) steps.push(["Снять паузу", () => sale.unpause()]);

  console.log(`\nШаги (${steps.length}):`);
  steps.forEach(([name], i) => console.log(`  ${i + 1}. ${name}`));
  if (!steps.length) {
    console.log("  всё уже сделано");
    return;
  }
  if (process.env.CONFIRM_PROMO_PRICE !== String(chainId)) {
    console.log(`\nЭто только показ. Для выполнения: CONFIRM_PROMO_PRICE=${chainId}`);
    return;
  }
  for (const [i, [name, send]] of steps.entries()) {
    console.log(`\n${i + 1}/${steps.length} ${name}. Подтвердите на Ledger.`);
    const receipt = await (await send()).wait();
    console.log(`✔ ${receipt.hash}`);
  }

  if ((await sale.price()) !== price) throw new Error("цена не изменилась");
  if ((await sale.paused()) === open) throw new Error("пауза не в том состоянии");
  const [bought, extra, total] = await sale.quoteTotalToBuyer(ethers.parseEther("100"));
  console.log(`\n✔ Цена ${ethers.formatEther(await sale.price())} USDT, пауза ${await sale.paused()}. За 100 USDT: ${f8(bought)} + бонус ${f8(extra)} = ${f8(total)} IBITI`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
