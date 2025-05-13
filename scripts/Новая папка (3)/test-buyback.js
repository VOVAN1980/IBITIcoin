// scripts/test-buyback.js
require('dotenv').config();
const hre        = require('hardhat');
const { ethers } = hre;

async function main() {
  const {
    IBITI_TOKEN_ADDRESS,
    BUYBACK_MANAGER_ADDRESS,
    USDT_TOKEN_ADDRESS
  } = process.env;

  if (!IBITI_TOKEN_ADDRESS ||
      !BUYBACK_MANAGER_ADDRESS ||
      !USDT_TOKEN_ADDRESS) {
    console.error(
      '❌ В .env должны быть IBITI_TOKEN_ADDRESS, BUYBACK_MANAGER_ADDRESS и USDT_TOKEN_ADDRESS'
    );
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const ibiti    = await ethers.getContractAt('IBITIcoin', IBITI_TOKEN_ADDRESS, signer);
  const buyback  = await ethers.getContractAt('BuybackManager', BUYBACK_MANAGER_ADDRESS, signer);
  const usdt     = await ethers.getContractAt('ERC20Mock', USDT_TOKEN_ADDRESS, signer);

  console.log('\n> Тест Buyback-сценария (с настройкой пути)\n');

  // 0) Настроим path и burnPercent у BuybackManager
  console.log('— Ставим path [USDT → IBI] и burnPercent = 50%');
  await (await buyback.setPath([USDT_TOKEN_ADDRESS, IBITI_TOKEN_ADDRESS])).wait();
  await (await buyback.setBurnPercent(50)).wait();
  console.log('   OK\n');

  // 1) Минтим и approve USDT
  const decUSDT = await usdt.decimals();
  const mintAmt = ethers.parseUnits('1000', decUSDT);
  console.log('— Минтим себе', ethers.formatUnits(mintAmt, decUSDT), 'USDT');
  await (await usdt.mint(signer.address, mintAmt)).wait();
  console.log('— Approve USDT → BuybackManager');
  await (await usdt.approve(BUYBACK_MANAGER_ADDRESS, mintAmt)).wait();

  // 2) Депозитим USDT
  console.log('\n— Депозитим USDT в BuybackManager');
  await (await buyback.depositPayment(mintAmt)).wait();

  // 3) Балансы до выкупа
  const decIBI      = await ibiti.decimals();
  const bbBefore    = await ibiti.balanceOf(BUYBACK_MANAGER_ADDRESS);
  const totalBefore = await ibiti.totalSupply();
  console.log('\nДо buybackAll():');
  console.log('  BuybackManager IBITI balance:', ethers.formatUnits(bbBefore, decIBI));
  console.log('  TotalSupply:', ethers.formatUnits(totalBefore, decIBI));

  // 4) Вызываем buybackAll(0)
  console.log('\n— Вызываем buybackAll(0)...');
  await (await buyback.buybackAll(0)).wait();

  // 5) Балансы после
  const bbAfter    = await ibiti.balanceOf(BUYBACK_MANAGER_ADDRESS);
  const burnAddr   = await buyback.burnAddress();
  const burnedAmt  = await ibiti.balanceOf(burnAddr);
  const totalAfter = await ibiti.totalSupply();
  console.log('\nПосле buybackAll():');
  console.log('  BuybackManager IBITI balance:', ethers.formatUnits(bbAfter, decIBI));
  console.log('  BurnAddress IBITI balance:   ', ethers.formatUnits(burnedAmt, decIBI));
  console.log('  TotalSupply:', ethers.formatUnits(totalAfter, decIBI));

  // 6) Проверка
  if (bbAfter < bbBefore) {
    console.log('\n✅ buybackAll() сработал: баланс BuybackManager уменьшился.');
    console.log('   Сожжено токенов:', ethers.formatUnits(burnedAmt, decIBI));
  } else {
    console.log('\n❌ buybackAll() не уменьшил баланс BuybackManager.');
  }
}

main().catch(err => {
  console.error('❌ Ошибка в test-buyback.js:', err);
  process.exit(1);
});
