// Включает продажу на контракте сайта. Подпись — владелец контракта, Ledger Основной.
// Не включит, если запас не на месте или цена не та. Без CONFIRM_ENABLE=56 только показывает.
//   npx hardhat run scripts/06-enable-promo-sale.js --network bscReserve
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);

async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 56n) throw new Error("Только BSC mainnet");
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "bsc.promo-sale.json"), "utf8"));
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const sale = await ethers.getContractAt("IBITIPromoSale", d.address, signer);

  const problems = [];
  if ((await sale.owner()) !== me) problems.push(`владелец ${await sale.owner()}, а подписывает ${me}`);
  if ((await sale.poolRemaining()) < I(1_000_000)) problems.push(`запас ${ethers.formatUnits(await sale.poolRemaining(), 8)} IBITI, нужен 1 000 000`);
  if ((await sale.price()) !== U("0.11")) problems.push("цена не $0,11");
  if ((await sale.quoteBoughtAmount(U(10))) !== 9_090_909_090n) problems.push("10 USDT должны давать 90.90909090 IBITI");
  if ((await sale.reserveWallet()) !== me) problems.push(`USDT идут на ${await sale.reserveWallet()}`);
  if (!(await sale.promoActive())) problems.push("промо выключено");

  const [bought, bonus] = await sale.quoteTotalToBuyer(U(10));
  console.log(`Контракт ${d.address}: на паузе ${await sale.paused()}, запас ${ethers.formatUnits(await sale.poolRemaining(), 8)} IBITI`);
  console.log(`10 USDT → ${ethers.formatUnits(bought, 8)} + ${ethers.formatUnits(bonus, 8)} бонус; USDT идут на ${await sale.reserveWallet()}`);
  if (problems.length) throw new Error(`не включаю:\n  - ${problems.join("\n  - ")}`);

  if (!(await sale.paused())) {
    console.log("Уже включён.");
    return;
  }
  if (process.env.CONFIRM_ENABLE !== "56") {
    console.log("\nЭто только показ. Для включения: CONFIRM_ENABLE=56");
    return;
  }
  const receipt = await (await sale.unpause()).wait();
  if (await sale.paused()) throw new Error("пауза не снялась");
  console.log(`\n✔ Продажа включена: ${receipt.hash}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
