// Запас контракта сайта: обычный перевод IBITI с Ledger Основной. Approve не нужен и не выдаётся.
// Запускает владелец кошелька. Без CONFIRM_FUND=56 только показывает, что будет сделано.
//   npx hardhat run scripts/fund-promo-sale.js --network bscReserve
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");

const AMOUNT = ethers.parseUnits("1000000", 8);

async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 56n) throw new Error("Только BSC mainnet");
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "bsc.promo-sale.json"), "utf8"));
  if (d.status !== "complete") throw new Error("Контракт сайта ещё не развёрнут");

  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const token = await ethers.getContractAt("IBITI", d.args[1], signer);
  const f = (x) => ethers.formatUnits(x, 8);

  const onSale = await token.balanceOf(d.address);
  console.log(`С кошелька  ${me}: ${f(await token.balanceOf(me))} IBITI, ${ethers.formatEther(await ethers.provider.getBalance(me))} BNB`);
  console.log(`На контракт ${d.address}: сейчас ${f(onSale)} IBITI`);
  console.log(`Перевод: ${f(AMOUNT)} IBITI, токен ${d.args[1]}`);

  if (onSale >= AMOUNT) {
    console.log("\nЗапас уже на месте, переводить не нужно.");
    return;
  }
  if (process.env.CONFIRM_FUND !== "56") {
    console.log("\nЭто только показ. Для перевода: CONFIRM_FUND=56");
    return;
  }

  const before = await token.balanceOf(me);
  const receipt = await (await token.transfer(d.address, AMOUNT)).wait();
  if ((await token.balanceOf(d.address)) !== onSale + AMOUNT || (await token.balanceOf(me)) !== before - AMOUNT) {
    throw new Error("суммы после перевода не сошлись");
  }
  console.log(`\n✔ Переведено: ${receipt.hash}`);
  console.log(`  на контракте ${f(await token.balanceOf(d.address))} IBITI, разрешений не выдавалось`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
