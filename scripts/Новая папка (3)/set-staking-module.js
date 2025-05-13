require('dotenv').config();
const hre        = require('hardhat');
const { ethers } = hre;

async function main() {
  const { IBITI_TOKEN_ADDRESS, STAKING_MODULE_ADDRESS } = process.env;
  if (!IBITI_TOKEN_ADDRESS || !STAKING_MODULE_ADDRESS) {
    throw new Error('❌ В .env должны быть IBITI_TOKEN_ADDRESS и STAKING_MODULE_ADDRESS');
  }

  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt('IBITIcoin', IBITI_TOKEN_ADDRESS, deployer);

  const current = await token.stakingModule();
  if (current.toLowerCase() === STAKING_MODULE_ADDRESS.toLowerCase()) {
    console.log('✅ StakingModule уже установлен:', current);
    return;
  }

  console.log(`🛠 Устанавливаем stakingModule:\n  ${STAKING_MODULE_ADDRESS}`);
  const tx = await token.setStakingModule(STAKING_MODULE_ADDRESS);
  await tx.wait();
  console.log('✅ stakingModule установлен');
}

main().catch((err) => {
  console.error('❌ Ошибка при установке stakingModule:', err);
  process.exit(1);
});
