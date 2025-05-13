// scripts/test-purchase-coin-token.js
require('dotenv').config();
const hre = require('hardhat');
const { ethers } = hre;

async function main() {
  const {
    IBITI_TOKEN_ADDRESS,
    USDT_TOKEN_ADDRESS
  } = process.env;

  // Берём первого (и единственного) сингера как owner+buyer
  const [signer] = await ethers.getSigners();
  console.log(`\n> Используем аккаунт: ${signer.address}\n`);

  // 1) Подключаем контракты
  const ibi  = await ethers.getContractAt('IBITIcoin', IBITI_TOKEN_ADDRESS, signer);
  const usdt = await ethers.getContractAt('ERC20Mock', USDT_TOKEN_ADDRESS, signer);

  // 2) Узнаём decimals у mock-USDT и выставляем цену 1 IBI = 1 USDT
  const decUSDT = await usdt.decimals();
  const oneUSDT = 10n ** BigInt(decUSDT);
  console.log(`USDT.decimals() = ${decUSDT} → oneUSDT = ${oneUSDT}`);

  console.log('\n— Allow and price 1 IBI = 1 USDT');
  await (await ibi.setAcceptedPayment(USDT_TOKEN_ADDRESS, true)).wait();
  await (await ibi.setCoinPriceToken(USDT_TOKEN_ADDRESS, oneUSDT)).wait();

  // Проверяем, что записалось
  const rawPrice = await ibi.coinPriceTokens(USDT_TOKEN_ADDRESS);
  console.log('coinPriceTokens[USDT] =', rawPrice.toString(), '\n');

  // 3) Сколько smallest-units IBI = 1 full IBI
  const decIBI = Number(await ibi.DECIMALS());
  const oneIBI = 10n ** BigInt(decIBI);
  console.log(`IBITIcoin.DECIMALS = ${decIBI} → oneIBI = ${oneIBI}\n`);

  // 4) Считаем, сколько USDT нужно заплатить за 1 IBI
  const PRICE_FACTOR = 10n ** BigInt(decIBI);
  const cost = (BigInt(rawPrice) * oneIBI) / PRICE_FACTOR;
  console.log(`Нужно USDT (smallest unit): ${cost} (~${ethers.formatUnits(cost, decUSDT)} USDT)\n`);

  // 5) Минтим и approve USDT
  await (await usdt.mint(signer.address, cost)).wait();
  await (await usdt.approve(IBITI_TOKEN_ADDRESS, cost)).wait();
  console.log('USDT после mint & approve:',
    ethers.formatUnits(await usdt.balanceOf(signer.address), decUSDT),
    'USDT\n'
  );

  // 6) Баланс IBI до покупки
  const balBefore = await ibi.balanceOf(signer.address);
  console.log('IBI до покупки:', balBefore.toString());

  // 7) Покупаем 1 IBI за USDT
  console.log('\n— Покупаем 1 IBI за USDT…');
  await (await ibi.purchaseCoinToken(USDT_TOKEN_ADDRESS, oneIBI)).wait();

  // 8) Результаты
  const balAfter      = await ibi.balanceOf(signer.address);
  const collectedUSDT = await usdt.balanceOf(IBITI_TOKEN_ADDRESS);
  console.log('IBI после покупки:', balAfter.toString());
  console.log('USDT на контракте IBI:', ethers.formatUnits(collectedUSDT, decUSDT), 'USDT\n');

  console.log('✅ Тест покупки IBI за токен успешно пройден.');
}

main()
  .catch(err => {
    console.error('❌ Ошибка test-purchase-coin-token.js:', err);
    process.exit(1);
  });
