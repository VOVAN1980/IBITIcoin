// Только BSC testnet: коллекция в настоящей сети после 09-deploy-nft.js и 10-setup-nft.js. Каждая запись подтверждается на Ledger.
// Покупка и передача. Что должно быть отклонено: выпуск мимо продажи, смена продавца и цены.
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
  await mustRevert("второй продавец", () => nft.setSeller.staticCall(sale.target));
  if ((await nft.seller()) !== sale.target) throw new Error("выпускает не наша продажа");

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

  await mustRevert("смена цены", () => sale.setPrices.staticCall([1], [ethers.parseEther("1")]));
  await mustRevert("обнуление цены", () => sale.setPrices.staticCall([1], [0]));
  console.log("Готово.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
