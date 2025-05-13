// scripts/process-commissions.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const me = await deployer.getAddress();

  const tokenAddr      = process.env.PAYMENT_TOKEN_ADDRESS.trim();
  const feeMgrAddr     = process.env.FEE_MANAGER_ADDRESS.trim();
  const buybackAddr    = process.env.BUYBACK_MANAGER_ADDRESS.trim();

  const token      = await ethers.getContractAt('IERC20', tokenAddr, deployer);
  const feeManager = await ethers.getContractAt('FeeManager', feeMgrAddr, deployer);
  const buyback    = await ethers.getContractAt('BuybackManager', buybackAddr, deployer);

  const DECIMALS = 18;

  // 1) Withdraw из FeeManager → ваш deployer
  let balInFee = await token.balanceOf(feeMgrAddr);
  console.log(`На FeeManager:       ${ethers.formatUnits(balInFee, DECIMALS)} токена`);
  if (balInFee > 0n) {
    console.log(`— withdrawPaymentToken(${tokenAddr})`);
    await (await feeManager.withdrawPaymentToken(tokenAddr)).wait();
  }

  // 2) Собранный баланс на deployer → BuybackManager
  let balMy = await token.balanceOf(me);
  console.log(`У меня на аккаунте:  ${ethers.formatUnits(balMy, DECIMALS)} токена`);
  if (balMy > 0n) {
    console.log(`— approve(${buybackAddr}, ${balMy})`);
    await (await token.approve(buybackAddr, balMy)).wait();

    console.log(`— depositPayment(${balMy})`);
    await (await buyback.depositPayment(balMy)).wait();
  }

  console.log('\n✅ Готово: комиссии выведены из FeeManager и депонированы в BuybackManager.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
