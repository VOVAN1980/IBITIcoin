// scripts/disable-transfer-fee.js
require('dotenv').config();
const hre        = require('hardhat');
const { ethers } = hre;

async function main() {
  const tokenAddr = process.env.IBITI_TOKEN_ADDRESS?.trim();
  if (!tokenAddr) {
    console.error('❌ В .env должен быть IBITI_TOKEN_ADDRESS');
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt('IBITIcoin', tokenAddr, deployer);

  console.log('Отключаем transferFeeEnabled = false...');
  await (await token.setTransferFeeEnabled(false)).wait();

  console.log('✅ transferFeeEnabled =', await token.transferFeeEnabled());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
