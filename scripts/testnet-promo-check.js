// Только BSC testnet: контракт сайта в настоящей сети. Каждая запись подтверждается на Ledger.
// Запас 1 млн → включение → покупка на 10 USDT с рефералом → проверки → пауза.
//   REFERRER=<адрес> npx hardhat run scripts/testnet-promo-check.js --network bscTestnet
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);
const fI = (x) => ethers.formatUnits(x, 8);
const fU = (x) => ethers.formatUnits(x, 18);

const mustRevert = async (label, call) => {
  await call().then(
    () => { throw new Error(`ДОЛЖНО БЫТЬ ОТКЛОНЕНО: ${label}`); },
    (e) => { if (e.message.startsWith("ДОЛЖНО")) throw e; console.log(`✔ отклонено: ${label}`); }
  );
};

async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 97n) throw new Error("Только BSC testnet");
  const referrer = process.env.REFERRER;
  if (!referrer || !ethers.isAddress(referrer)) throw new Error("Укажите REFERRER=<адрес>");

  const dir = path.dirname(deploymentsPath(network.name));
  const d = JSON.parse(fs.readFileSync(path.join(dir, `${network.name}.promo-sale.json`), "utf8"));
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const sale = await ethers.getContractAt("IBITIPromoSale", d.address, signer);
  const usdt = await ethers.getContractAt("TestUSDT", d.args[0], signer);
  const token = await ethers.getContractAt("IBITI", d.args[1], signer);
  const reserve = d.args[3];

  await mustRevert("покупка на паузе", () => sale.buyWithReferral.staticCall(U(10), ethers.ZeroAddress, 0));

  if ((await sale.poolRemaining()) === 0n) {
    console.log("Запас: перевожу 1 000 000 IBITI на контракт обычным переводом. Подтвердите на Ledger.");
    await (await token.transfer(d.address, I(1_000_000))).wait();
  }
  console.log(`✔ на контракте ${fI(await sale.poolRemaining())} IBITI`);

  if (await sale.paused()) {
    console.log("Включаю продажу. Подтвердите на Ledger.");
    await (await sale.unpause()).wait();
  }

  await mustRevert("меньше $10", () => sale.buyWithReferral.staticCall(U(10) - 1n, ethers.ZeroAddress, 0));
  await mustRevert("больше $100", () => sale.buyWithReferral.staticCall(U(100) + 1n, ethers.ZeroAddress, 0));
  await mustRevert("смена цены без паузы", () => sale.setPrice.staticCall(U("0.2")));

  console.log("Разрешаю контракту ровно 10 USDT. Подтвердите на Ledger.");
  await (await usdt.approve(d.address, U(10))).wait();

  const before = {
    buyer: await token.balanceOf(me), ref: await token.balanceOf(referrer),
    reserve: await usdt.balanceOf(reserve), usdt: await usdt.balanceOf(me), pool: await sale.poolRemaining(),
  };
  console.log("Покупка на 10 USDT с реферером. Подтвердите на Ledger.");
  await (await sale.buyWithReferral(U(10), referrer, I(100))).wait();

  const got = (await token.balanceOf(me)) - before.buyer;
  const refGot = (await token.balanceOf(referrer)) - before.ref;
  const reserveGot = (await usdt.balanceOf(reserve)) - before.reserve;
  const paid = before.usdt - (await usdt.balanceOf(me));
  console.log(`  заплачено ${fU(paid)} USDT, получено ${fI(got)} IBITI, реферал ${fI(refGot)}, на резерв ${fU(reserveGot)} USDT`);
  if (paid !== U(10) || got !== I(110) || refGot !== I(1) || reserveGot !== U(10)) throw new Error("суммы не сошлись");
  if ((await usdt.balanceOf(d.address)) !== 0n) throw new Error("на контракте остался USDT");
  if (before.pool - (await sale.poolRemaining()) !== I(111)) throw new Error("запас уменьшился не на 111 IBITI");
  if ((await usdt.allowance(me, d.address)) !== 0n) throw new Error("разрешение не израсходовано");
  console.log("✔ суммы сошлись, на контракте 0 USDT, разрешение израсходовано");

  await mustRevert("покупка без разрешения", () => sale.buyWithReferral.staticCall(U(10), ethers.ZeroAddress, 0));

  const [total, bonus, ref] = await sale.getStats();
  console.log(`Статистика для сайта: всего ${fI(total)}, бонус ${fI(bonus)}, реферал ${fI(ref)}, продано ${fI(await sale.soldTotal())}, остаток ${fI(await sale.poolRemaining())}`);

  console.log("Ставлю обратно на паузу. Подтвердите на Ledger.");
  await (await sale.pause()).wait();
  await mustRevert("покупка на паузе", () => sale.buyWithReferral.staticCall(U(10), ethers.ZeroAddress, 0));
  console.log("Готово: контракт на паузе.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
