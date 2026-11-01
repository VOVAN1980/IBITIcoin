// Публикует исходники на BscScan для контрактов из deployments/<сеть>.json.
// Нужен ETHERSCAN_V2_KEY. Сканеры без проверенного исходника ставят флаг риска.
const hre = require("hardhat");
const fs = require("fs");
const { deploymentsPath } = require("./lib/plan");

async function verify(address, constructorArguments, contract) {
  try {
    await hre.run("verify:verify", { address, constructorArguments, contract });
    console.log(`✔ ${address}`);
  } catch (e) {
    if (/already verified/i.test(e.message)) console.log(`✔ ${address} (уже проверен)`);
    else throw e;
  }
}

async function main() {
  const file = deploymentsPath(hre.network.name);
  if (!fs.existsSync(file)) throw new Error(`Нет ${file}`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  await verify(d.vesting.address, d.vesting.args, "contracts/IBITIVesting.sol:IBITIVesting");
  await verify(d.token.address, d.token.args, "contracts/IBITI.sol:IBITI");
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
