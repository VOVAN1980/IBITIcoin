// scripts/test-sale-discount-token.js
require('dotenv').config();
const hre        = require('hardhat');
const { ethers } = hre;

async function main() {
  const {
    IBITI_TOKEN_ADDRESS,
    STAKING_MODULE_ADDRESS,
    USDT_TOKEN_ADDRESS
  } = process.env;
  if (!IBITI_TOKEN_ADDRESS || !STAKING_MODULE_ADDRESS || !USDT_TOKEN_ADDRESS) {
    console.error('❌ В .env должны быть IBITI_TOKEN_ADDRESS, STAKING_MODULE_ADDRESS и USDT_TOKEN_ADDRESS');
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const token     = await ethers.getContractAt('IBITIcoin', IBITI_TOKEN_ADDRESS, signer);
  const usdt      = await ethers.getContractAt('ERC20Mock', USDT_TOKEN_ADDRESS, signer);

  // ── Настройка mock-USDT как платежного токена ──
  const tokenOwner = token.connect(signer);
  console.log('— Разрешаем оплату mock-USDT и ставим цену 1 IBI = 1 USDT…');
  await tokenOwner.setAcceptedPayment(USDT_TOKEN_ADDRESS, true);
  const oneUSDTraw = ethers.parseUnits('1', await usdt.decimals());
  await tokenOwner.setCoinPriceToken(USDT_TOKEN_ADDRESS, oneUSDTraw);
  console.log('   OK\n');

  // Продаём 100 IBI
  const decIBI  = await token.decimals();
  const sellAmt = ethers.parseUnits('100', decIBI);

  // Минтим контракту 10 000 USDT для выплат
  const decUSDT = await usdt.decimals();
  const mintAmt = ethers.parseUnits('10000', decUSDT);
  console.log(`— Подготовка: минтим контракту ${ethers.formatUnits(mintAmt, decUSDT)} USDT`);
  await usdt.mint(token.target, mintAmt);

  // 1) Продажа ДО стейка (за USDT)
  console.log('\n— Продажа ДО стейка (за USDT):');
  await token.approve(token.target, sellAmt);
  const before1 = await usdt.balanceOf(signer.address);
  await token.sellCoinToken(USDT_TOKEN_ADDRESS, sellAmt, 0);
  const after1  = await usdt.balanceOf(signer.address);
  const got1    = after1 - before1;
  console.log('  Получено USDT:', ethers.formatUnits(got1, decUSDT));

  // 2) Стейк 100 IBI на 1 месяц
  console.log('\n— Стейкаем 100 IBI на 1 месяц');
  await token.approve(STAKING_MODULE_ADDRESS, sellAmt);
  await token.stakeTokens(sellAmt, 1);

  // 3) Продажа ПОСЛЕ стейка (за USDT)
  console.log('\n— Продажа ПОСЛЕ стейка (за USDT):');
  await token.approve(token.target, sellAmt);
  const before2 = await usdt.balanceOf(signer.address);
  await token.sellCoinToken(USDT_TOKEN_ADDRESS, sellAmt, 0);
  const after2  = await usdt.balanceOf(signer.address);
  const got2    = after2 - before2;
  console.log('  Получено USDT:', ethers.formatUnits(got2, decUSDT));

  // Итоги
  console.log('\n— Итоги:');
  console.log('  До стейка получили:   ', ethers.formatUnits(got1, decUSDT), 'USDT');
  console.log('  После стейка получили:', ethers.formatUnits(got2, decUSDT), 'USDT');
  if (got2 > got1) {
    console.log('\n✅ Скидка при продаже за токен сработала.');
  } else {
    console.log('\n❌ Скидка при продаже за токен не сработала.');
  }
}

main().catch(err => {
  console.error('❌ Ошибка теста продажи за токен:', err);
  process.exit(1);
});
