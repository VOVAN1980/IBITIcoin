// Закрывает старые стейкинг и продажу карточек и переносит запас наград на новый стейкинг. Подпись — владелец старых контрактов.
// Запускается дважды: до деплоя новых контрактов (только пауза) и после (перенос запаса). Журналы старых: *.staking-old.json, *.nft-old.json.
// Паузу ставит всегда. Если у старых контрактов есть открытые обязательства, запас не переносит.
// Неверный новый стейкинг останавливает скрипт до первой подписи. Без CONFIRM_CLOSE_OLD=<chainId> только показывает.
//   npx hardhat run scripts/11-close-old-nft.js --network bscReserve
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");
const { closeOldSteps } = require("./lib/nft-setup");

const OLD_STAKING = [
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function pause()",
  "function token() view returns (address)",
  "function totalStaked() view returns (uint256)",
  "function reservedRewards() view returns (uint256)",
  "function freeRewards() view returns (uint256)",
  "function withdrawFreeRewards(address,uint256)",
];
const OLD_SALE = ["function owner() view returns (address)", "function paused() view returns (bool)", "function pause()"];
const OLD_NFT = ["function lastTokenId() view returns (uint256)"];

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);
  const prefix = chainId === 56 ? "bsc" : "bscTestnet";
  const dir = path.join(__dirname, "..", "deployments");
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${prefix}.${name}.json`), "utf8"));
  const oldS = read("staking-old");
  const oldN = read("nft-old");

  const newFile = path.join(dir, `${prefix}.staking.json`);
  const newJournal = fs.existsSync(newFile) ? JSON.parse(fs.readFileSync(newFile, "utf8")) : null;
  const newStakingAddress = newJournal && newJournal.status === "complete" ? newJournal.address : null;

  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const oldStaking = new ethers.Contract(oldS.address, OLD_STAKING, signer);
  const oldSale = new ethers.Contract(oldN.sale.address, OLD_SALE, signer);
  const oldNft = new ethers.Contract(oldN.collection.address, OLD_NFT, signer);

  const problems = [];
  if ((await oldStaking.owner()) !== me) problems.push(`владелец старого стейкинга ${await oldStaking.owner()}, а подписывает ${me}`);
  if ((await oldSale.owner()) !== me) problems.push(`владелец старой продажи ${await oldSale.owner()}, а подписывает ${me}`);
  const token = JSON.parse(fs.readFileSync(path.join(dir, `${prefix}.json`), "utf8")).token.address;
  if ((await oldStaking.token()) !== token) problems.push(`старый стейкинг работает не с нашим токеном: ${await oldStaking.token()}`);
  if (problems.length) throw new Error(`не закрываю:\n  - ${problems.join("\n  - ")}`);

  // На testnet в старой коллекции есть проверочные покупки
  const { steps, inUse } = await closeOldSteps({ oldStaking, oldSale, oldNft: chainId === 56 ? oldNft : null, newStakingAddress, owner: me });
  if (inUse.length) console.log(`У старых контрактов есть открытые обязательства, запас наград не переношу:\n  - ${inUse.join("\n  - ")}\n`);
  console.log(`Сеть ${network.name} (${chainId}), подписывает ${me}, BNB ${ethers.formatEther(await ethers.provider.getBalance(me))}`);
  console.log(`Старый стейкинг ${oldS.address}\nСтарая продажа  ${oldN.sale.address}\nНовый стейкинг  ${newStakingAddress || "ещё не развёрнут"}\n`);
  console.log(`Шаги (${steps.length}):`);
  steps.forEach(([name], i) => console.log(`  ${i + 1}. ${name}`));
  if (!steps.length) {
    console.log("  всё уже сделано");
    return;
  }
  if (process.env.CONFIRM_CLOSE_OLD !== String(chainId)) {
    console.log(`\nЭто только показ. Для выполнения: CONFIRM_CLOSE_OLD=${chainId}`);
    return;
  }
  for (const [i, [name, send]] of steps.entries()) {
    console.log(`\n${i + 1}/${steps.length} ${name}. Подтвердите на Ledger.`);
    const receipt = await (await send()).wait();
    console.log(`✔ ${receipt.hash}`);
  }
  console.log("\n✔ Готово");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
