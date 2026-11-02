// Включает стейкинг. Подпись — владелец контракта: в mainnet Ledger Основной, на testnet подписант деплоя.
// Не включит, если запас не на месте или лестница не та.
// Без CONFIRM_ENABLE=<chainId> только показывает.
//   npx hardhat run scripts/08-enable-staking.js --network bscReserve
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");

const I = (n) => ethers.parseUnits(String(n), 8);
const LADDER = [1, 3, 5, 7, 10, 12, 14, 18, 20, 22, 25, 30];

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 56 && chainId !== 97) throw new Error(`Сеть ${chainId} не поддерживается`);
  const prefix = chainId === 56 ? "bsc" : "bscTestnet";
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${prefix}.staking.json`), "utf8"));
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const staking = await ethers.getContractAt("IBITIStaking", d.address, signer);

  const problems = [];
  if ((await staking.owner()) !== me) problems.push(`владелец ${await staking.owner()}, а подписывает ${me}`);
  if ((await staking.freeRewards()) < I(1_000_000)) problems.push(`свободный запас ${ethers.formatUnits(await staking.freeRewards(), 8)} IBITI, нужен 1 000 000`);
  if ((await staking.minStake()) !== I(100)) problems.push("минимальный вклад не 100 IBITI");
  if ((await staking.CLAIM_WINDOW()) !== 30n * 86400n) problems.push("окно не 30 дней");
  for (let m = 1; m <= 12; m++) {
    if ((await staking.rewardPercent(m)) !== BigInt(LADDER[m - 1])) problems.push(`неверный процент за ${m} мес`);
  }

  console.log(`Контракт ${d.address}: на паузе ${await staking.paused()}, свободный запас ${ethers.formatUnits(await staking.freeRewards(), 8)} IBITI`);
  console.log(`1 000 IBITI на 12 месяцев: награда ${ethers.formatUnits(await staking.quoteReward(I(1_000), 12), 8)} IBITI`);
  if (problems.length) throw new Error(`не включаю:\n  - ${problems.join("\n  - ")}`);

  if (!(await staking.paused())) {
    console.log("Уже включён.");
    return;
  }
  if (process.env.CONFIRM_ENABLE !== String(chainId)) {
    console.log(`\nЭто только показ. Для включения: CONFIRM_ENABLE=${chainId}`);
    return;
  }
  const receipt = await (await staking.unpause()).wait();
  if (await staking.paused()) throw new Error("пауза не снялась");
  console.log(`\n✔ Стейкинг включён: ${receipt.hash}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
