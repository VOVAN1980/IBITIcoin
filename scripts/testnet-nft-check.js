// Только BSC testnet: коллекция в настоящей сети после 09-deploy-nft.js и 10-setup-nft.js. Каждая запись подтверждается на Ledger.
// Покупка, передача и бонус из общего тиража. Подписант на время получает право выдавать бонус, в конце оно снимается.
//   npx hardhat run scripts/testnet-nft-check.js --network bscTestnet
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

const BURN = "0x000000000000000000000000000000000000dEaD";

const mustRevert = async (label, call) => {
  await call().then(
    () => { throw new Error(`ДОЛЖНО БЫТЬ ОТКЛОНЕНО: ${label}`); },
    (e) => { if (e.message.startsWith("ДОЛЖНО")) throw e; console.log(`✔ отклонено: ${label}`); }
  );
};

async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 97n) throw new Error("Только BSC testnet");

  const dir = path.dirname(deploymentsPath(network.name));
  const d = JSON.parse(fs.readFileSync(path.join(dir, `${network.name}.nft.json`), "utf8"));
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const nft = await ethers.getContractAt("IBITICollection", d.collection.address, signer);
  const sale = await ethers.getContractAt("IBITINFTSale", d.sale.address, signer);
  const usdt = await ethers.getContractAt("TestUSDT", d.usdt, signer);

  const [royaltyTo, royalty] = await nft.royaltyInfo(1, 10_000);
  if (royaltyTo !== d.reserve || royalty !== 500n) throw new Error("неверный процент с перепродаж");
  console.log(`✔ процент с перепродаж 5% на ${royaltyTo}`);

  await mustRevert("выпуск мимо продажи", () => nft.mint.staticCall(me, 1));
  await mustRevert("бонус без права", () => nft.mintJackpot.staticCall(me, 10, ""));

  const price = await sale.priceOf(1);
  await mustRevert("покупка по чужой цене", () => sale.buy.staticCall(1, price + 1n));
  console.log(`Разрешение на ${ethers.formatEther(price)} USDT. Подтвердите на Ledger.`);
  await (await usdt.approve(sale.target, price)).wait();
  const before = await usdt.balanceOf(d.reserve);
  console.log("Покупка карточки 1. Подтвердите на Ledger.");
  await (await sale.buy(1, price)).wait();
  const bought = await nft.lastTokenId();
  if ((await nft.ownerOf(bought)) !== me || (await nft.cardOf(bought)) !== 1n) throw new Error("NFT выпущен неверно");
  if ((await usdt.allowance(me, sale.target)) !== 0n) throw new Error("осталось разрешение");
  if (d.reserve !== me && (await usdt.balanceOf(d.reserve)) !== before + price) throw new Error("USDT не дошли");
  if ((await usdt.balanceOf(sale.target)) !== 0n) throw new Error("USDT остались на продаже");
  console.log(`✔ NFT #${bought}: ${await nft.tokenURI(bought)}`);

  console.log("Передача купленной карточки. Подтвердите на Ledger.");
  await (await nft.transferFrom(me, BURN, bought)).wait();
  if ((await nft.ownerOf(bought)) !== BURN) throw new Error("передача не прошла");
  console.log("✔ купленная карточка передаётся");

  console.log("Право выдавать бонус подписанту. Подтвердите на Ledger.");
  await (await nft.setJackpotMinter(me, true)).wait();
  await mustRevert("неверный уровень бонуса", () => nft.mintJackpot.staticCall(me, 4, ""));

  const [mintedBefore] = await nft.supplyOf(5);
  console.log("Бонус уровня 10. Подтвердите на Ledger.");
  await (await nft.mintJackpot(me, 10, "")).wait();
  const bonus = await nft.lastTokenId();
  const [mintedAfter] = await nft.supplyOf(5);
  if ((await nft.cardOf(bonus)) !== 5n) throw new Error("бонус выдал не ту карточку");
  if (mintedAfter !== mintedBefore + 1n) throw new Error("бонус не уменьшил тираж");
  console.log(`✔ бонус #${bonus}: карточка 5, тираж ${mintedBefore} → ${mintedAfter}, ${await nft.tokenURI(bonus)}`);

  console.log("Передача бонусной карточки. Подтвердите на Ledger.");
  await (await nft.transferFrom(me, BURN, bonus)).wait();
  if ((await nft.ownerOf(bonus)) !== BURN) throw new Error("передача не прошла");
  console.log("✔ бонусная карточка передаётся");

  console.log("Снимаю право выдавать бонус. Подтвердите на Ledger.");
  await (await nft.setJackpotMinter(me, false)).wait();
  await mustRevert("бонус без права", () => nft.mintJackpot.staticCall(me, 10, ""));
  console.log("Готово.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
