// Только BSC testnet: проверка вестинга в настоящей сети. Подпись — у владельца вестинга.
//   MEMBER=<адрес> npx hardhat run scripts/testnet-vesting-check.js --network bscTestnet
const hre = require("hardhat");
const { ethers, network } = hre;
const fs = require("fs");
const { deploymentsPath, DECIMALS } = require("./lib/plan");
const { getSigner } = require("./lib/signer");

const f = (x) => ethers.formatUnits(x, DECIMALS);

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 97n) throw new Error("Этот скрипт только для BSC testnet (chainId 97)");
  const member = process.env.MEMBER;
  if (!member || !ethers.isAddress(member)) throw new Error("Укажите MEMBER=<адрес>");

  const d = JSON.parse(fs.readFileSync(deploymentsPath(network.name), "utf8"));
  const signer = await getSigner(hre);
  const vesting = await ethers.getContractAt("IBITIVesting", d.vesting.address, signer);
  const token = await ethers.getContractAt("IBITI", d.token.address, signer);

  const open = await vesting.available();
  console.log(`Открыто сейчас: ${f(open)} из ${f(await vesting.totalAllocation())}`);
  if (open !== (await vesting.totalAllocation()) * 20n / 100n) throw new Error("на старте должно быть открыто ровно 20%");

  // Чужому адресу, ещё не в списке, выдать нельзя (проверка без отправки транзакции)
  await vesting.release.staticCall(member, 1n).then(
    () => { throw new Error("выдача адресу не из списка должна отклоняться"); },
    (e) => { if (e.message.includes("должна отклоняться")) throw e; console.log("✔ адресу не из списка выдать нельзя"); }
  );

  if (!(await vesting.isMember(member))) {
    console.log("Добавляю адрес в список команды. Подтвердите на Ledger.");
    await (await vesting.addMember(member)).wait();
  }
  console.log(`✔ адрес ${member} в списке`);

  console.log(`Выдаю ${f(open)} IBITI. Подтвердите на Ledger.`);
  const before = await token.balanceOf(member);
  await (await vesting.release(member, open)).wait();
  const got = (await token.balanceOf(member)) - before;
  if (got !== open) throw new Error(`получено ${f(got)}, ожидалось ${f(open)}`);
  console.log(`✔ получено ровно ${f(got)} IBITI`);

  await vesting.release.staticCall(member, 1n).then(
    () => { throw new Error("сверх открытого выдавать нельзя"); },
    (e) => { if (e.message.includes("сверх открытого")) throw e; console.log("✔ сверх открытого не выдаётся, даже 1 мин. единицу"); }
  );
  console.log(`Выдано всего ${f(await vesting.released())}, на контракте ${f(await token.balanceOf(vesting.target))}`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
