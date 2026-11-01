// Ликвидность IBITI/USDT на PancakeSwap.
//   Первая:  LIQ_IBITI=100000 LIQ_PRICE_USDT=0.10 npx hardhat run scripts/04-add-liquidity.js --network bscLiquidity
//   Доливка: то же плюс ALLOW_TOPUP=1 (цена пула должна быть в пределах 2% от LIQ_PRICE_USDT).
// Без CONFIRM_LIQUIDITY=<chainId> только показывает расчёт.
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const { deploymentsPath } = require("./lib/plan");
const { usdtForIbiti } = require("./lib/pool-math");
const { PANCAKE, planLiquidity, addLiquidity } = require("./lib/liquidity");
const { getSigner } = require("./lib/signer");

async function main() {
  const signer = await getSigner(hre);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deployNet = network.name === "bscLiquidity" ? "bsc" : network.name;
  const file = deploymentsPath(deployNet);
  if (!fs.existsSync(file)) throw new Error(`Нет ${file} — сначала деплой токена`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  const pancake = PANCAKE[chainId];
  if (!pancake) throw new Error(`PancakeSwap для chainId ${chainId} не настроен`);
  const usdtAddress = pancake.usdt || process.env.TESTNET_USDT;
  if (!usdtAddress) throw new Error("Для testnet укажите TESTNET_USDT");

  const { LIQ_IBITI, LIQ_PRICE_USDT, ALLOW_TOPUP } = process.env;
  if (!LIQ_IBITI || !LIQ_PRICE_USDT) throw new Error("Укажите LIQ_IBITI (сколько IBITI) и LIQ_PRICE_USDT (цена 1 IBITI, например 0.10)");

  const p = await planLiquidity({
    signer, tokenAddress: d.token.address, usdtAddress, routerAddress: pancake.router,
    ibitiHuman: LIQ_IBITI, priceUsdt: LIQ_PRICE_USDT, allowTopup: ALLOW_TOPUP === "1",
  });

  console.log(`Сеть ${network.name} (chainId ${chainId}), кошелёк ${p.me}, режим: ${p.mode === "first" ? "первая ликвидность" : "доливка"}`);
  console.log(`В пул: ${ethers.formatUnits(p.ibitiAmount, p.decI)} IBITI + ${ethers.formatUnits(p.usdtAmount, p.decU)} USDT`);
  console.log(`Минимум: ${ethers.formatUnits(p.ibitiMin, p.decI)} IBITI + ${ethers.formatUnits(p.usdtMin, p.decU)} USDT`);
  console.log(`Цена 1 IBITI: ${p.price} USDT. Проверка знаков (IBITI ${p.decI}, USDT ${p.decU}):`);
  for (const n of [1, 1_000, 1_000_000]) {
    const usdt = usdtForIbiti(ethers.parseUnits(String(n), p.decI), LIQ_PRICE_USDT, p.decI, p.decU);
    console.log(`  ${n.toLocaleString("ru-RU").padStart(9)} IBITI = ${ethers.formatUnits(usdt, p.decU)} USDT`);
  }
  if (p.problems.length) throw new Error(`нельзя:\n  - ${p.problems.join("\n  - ")}`);

  if (process.env.CONFIRM_LIQUIDITY !== String(chainId)) {
    console.log(`\nЭто только расчёт. Для отправки: CONFIRM_LIQUIDITY=${chainId}`);
    return;
  }

  const r = await addLiquidity(p);
  console.log(`\n✔ Ликвидность добавлена: ${r.tx}`);
  console.log(`  Пара: ${r.pairAddress}`);
  console.log(`  LP-токены на ${p.me}: ${ethers.formatUnits(r.lp, 18)}`);
  console.log(r.warning ? `  ⚠ ${r.warning}` : "  Разрешения роутеру обнулены.");
  console.log("\nLP-токены скрипт не сжигает и не блокирует: это отдельный шаг, см. README.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
