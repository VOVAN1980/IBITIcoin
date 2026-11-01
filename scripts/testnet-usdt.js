// Только BSC testnet: деплоит тестовый USDT с 18 знаками и записывает адрес в TESTNET_USDT в .env.
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
const { getSigner } = require("./lib/signer");

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 97n) throw new Error("Этот скрипт только для BSC testnet (chainId 97)");

  const existing = (process.env.TESTNET_USDT || "").trim();
  if (existing) {
    const t = await ethers.getContractAt("TestUSDT", existing);
    const decimals = await t.decimals();
    if (decimals !== 18n) throw new Error(`TESTNET_USDT ${existing} имеет ${decimals} знаков, нужно 18`);
    console.log(`Уже есть: ${existing}, 18 знаков`);
    return;
  }

  const signer = await getSigner(hre);
  console.log(`Деплой TestUSDT с ${await signer.getAddress()}. Подтвердите на Ledger.`);
  const factory = await ethers.getContractFactory("TestUSDT", signer);
  const usdt = await factory.deploy();
  await usdt.waitForDeployment();
  const address = await usdt.getAddress();
  if ((await usdt.decimals()) !== 18n) throw new Error("у тестового USDT не 18 знаков");

  const envPath = path.join(__dirname, "..", ".env");
  const text = fs.readFileSync(envPath, "utf8");
  if (!/^TESTNET_USDT=.*$/m.test(text)) throw new Error("В .env нет строки TESTNET_USDT=");
  fs.writeFileSync(envPath, text.replace(/^TESTNET_USDT=.*$/m, `TESTNET_USDT=${address}`));

  console.log(`✔ TestUSDT: ${address}, 18 знаков, записан в .env`);
}

main().catch((e) => {
  console.error(`\n✖ ${e.shortMessage || e.message}`);
  process.exitCode = 1;
});
