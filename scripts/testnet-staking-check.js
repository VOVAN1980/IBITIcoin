// Только BSC testnet: стейкинг в настоящей сети. Каждая запись подтверждается на Ledger.
// Запас 1 млн → включение → вклад 1 000 IBITI на 12 месяцев → досрочный выход → проверки → пауза.
// Выход в срок и окно 30 дней в живой сети ждать долго, они проверены в test/IBITIStaking.test.js.
//   npx hardhat run scripts/testnet-staking-check.js --network bscTestnet
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const path = require("path");
const { deploymentsPath } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

const I = (n) => ethers.parseUnits(String(n), 8);
const f = (x) => ethers.formatUnits(x, 8);

const mustRevert = async (label, call) => {
  await call().then(
    () => { throw new Error(`ДОЛЖНО БЫТЬ ОТКЛОНЕНО: ${label}`); },
    (e) => { if (e.message.startsWith("ДОЛЖНО")) throw e; console.log(`✔ отклонено: ${label}`); }
  );
};

async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 97n) throw new Error("Только BSC testnet");

  const dir = path.dirname(deploymentsPath(network.name));
  const d = JSON.parse(fs.readFileSync(path.join(dir, `${network.name}.staking.json`), "utf8"));
  const signer = await getSigner(hre);
  const me = await signer.getAddress();
  const staking = await ethers.getContractAt("IBITIStaking", d.address, signer);
  const token = await ethers.getContractAt("IBITI", d.args[0], signer);

  await mustRevert("вклад на паузе", () => staking.stake.staticCall(I(1_000), 12));

  if ((await staking.freeRewards()) === 0n) {
    console.log("Запас: перевожу 1 000 000 IBITI на контракт обычным переводом. Подтвердите на Ledger.");
    await (await token.transfer(d.address, I(1_000_000))).wait();
  }
  console.log(`✔ свободный запас ${f(await staking.freeRewards())} IBITI`);

  if (await staking.paused()) {
    console.log("Включаю стейкинг. Подтвердите на Ledger.");
    await (await staking.unpause()).wait();
  }

  await mustRevert("меньше минимума", () => staking.stake.staticCall(I(100) - 1n, 12));
  await mustRevert("13 месяцев", () => staking.stake.staticCall(I(1_000), 13));
  await mustRevert("смена минимума без паузы", () => staking.setMinStake.staticCall(I(50)));
  await mustRevert("вывод больше свободного запаса", async () => staking.withdrawFreeRewards.staticCall(me, (await staking.freeRewards()) + 1n));

  console.log("Разрешаю контракту ровно 1 000 IBITI. Подтвердите на Ledger.");
  await (await token.approve(d.address, I(1_000))).wait();

  const id = await staking.stakeCount(me);
  const free = await staking.freeRewards();
  const reserved = await staking.reservedRewards();
  const total = await staking.totalStaked();
  const balance = await token.balanceOf(me);

  console.log("Вклад 1 000 IBITI на 12 месяцев. Подтвердите на Ledger.");
  await (await staking.stake(I(1_000), 12)).wait();
  if ((await staking.totalStaked()) !== total + I(1_000)) throw new Error("вклад не учтён");
  if ((await staking.reservedRewards()) !== reserved + I(300)) throw new Error("награда не зарезервирована");
  if ((await staking.freeRewards()) !== free - I(300)) throw new Error("запас уменьшился не на 300");
  if ((await token.allowance(me, d.address)) !== 0n) throw new Error("разрешение не израсходовано");
  console.log(`✔ вклад учтён, 300 IBITI зарезервированы, разрешение израсходовано, до срока ${await staking.maturityOf(me, id)}`);

  await mustRevert("продление до срока", () => staking.renew.staticCall(id, I(1_000), 12));
  await mustRevert("освобождение резерва до срока", () => staking.releaseExpired.staticCall(me, id));

  const [payout, , penalty] = await staking.quoteUnstake(me, id);
  if (payout !== I(700) || penalty !== I(300)) throw new Error("подсказка должна показать 700 и штраф 300");

  console.log("Досрочный выход: ждём 700 IBITI, штраф 300. Подтвердите на Ledger.");
  await (await staking.unstake(id)).wait();
  if ((await token.balanceOf(me)) !== balance - I(300)) throw new Error("выплата не 700 IBITI");
  if ((await staking.freeRewards()) !== free + I(300)) throw new Error("штраф не вернулся в запас");
  if ((await staking.reservedRewards()) !== reserved) throw new Error("резерв не освобождён");
  console.log(`✔ получено 700 IBITI, штраф ушёл в запас: ${f(await staking.freeRewards())} IBITI`);

  await mustRevert("второй выход из того же вклада", () => staking.unstake.staticCall(id));

  console.log("Ставлю обратно на паузу. Подтвердите на Ledger.");
  await (await staking.pause()).wait();
  await mustRevert("вклад на паузе", () => staking.stake.staticCall(I(1_000), 12));
  console.log("Готово: контракт на паузе.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
