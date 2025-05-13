// scripts/configure-production.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
  // ———————————— 1. Настройки цен ————————————
  // Установите здесь свои значения:
  const COIN_PRICE_USD       = 100000;           // в центах USD
  const COIN_PRICE_BNB       = '3000000000000000'; // в wei (0.003 BNB)
  const COIN_PRICE_TOKEN     = 100000;           // в smallest unit (USDT)
  const NFT_PRICE_LEVEL      = 5;                // уровень скидки для NFTSaleManager
  const NFT_PRICE_USD        = 1000;             // цена NFT в центах USD
  const NFT_PRICE_IBI_USDT   = '10000000';       // в smallest unit IBI/USDT

  // ———————————— 2. Адреса из .env ————————————
  const {
    IBITI_TOKEN_ADDRESS,
    NFTSALEMANAGER_ADDRESS,
    IBITINFT_ADDRESS,
    USDT_TOKEN_ADDRESS
  } = process.env;

  // Проверяем, что адреса есть
  const miss = [
    !IBITI_TOKEN_ADDRESS && 'IBITI_TOKEN_ADDRESS',
    !NFTSALEMANAGER_ADDRESS && 'NFTSALEMANAGER_ADDRESS',
    !IBITINFT_ADDRESS && 'IBITINFT_ADDRESS',
    !USDT_TOKEN_ADDRESS   && 'USDT_TOKEN_ADDRESS'
  ].filter(x => x);
  if (miss.length) {
    console.error('❌ В .env не найдены адреса:', miss.join(', '));
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`\n> Отправитель: ${deployer.address}\n`);

  // ———————————— 3. IBITIcoin: unpause + цены ————————————
  const IB = await ethers.getContractFactory('IBITIcoin');
  const ibi = IB.attach(IBITI_TOKEN_ADDRESS);

  if (await ibi.paused()) {
    console.log('— IBITIcoin.paused → unpause()');
    await (await ibi.unpause()).wait();
  }
  console.log(`— setCoinPriceUSD(${COIN_PRICE_USD})`);
  await (await ibi.setCoinPriceUSD(COIN_PRICE_USD)).wait();
  console.log(`— setCoinPriceBNB(${COIN_PRICE_BNB})`);
  await (await ibi.setCoinPriceBNB(COIN_PRICE_BNB)).wait();
  console.log(`— setCoinPriceToken(${USDT_TOKEN_ADDRESS}, ${COIN_PRICE_TOKEN})`);
  await (await ibi.setCoinPriceToken(USDT_TOKEN_ADDRESS, COIN_PRICE_TOKEN)).wait();

  // ———————————— 4. NFTSaleManager: unpause + цена ————————————
  const NSM = await ethers.getContractFactory('NFTSaleManager');
  const nsm = NSM.attach(NFTSALEMANAGER_ADDRESS);

  if (await nsm.paused()) {
    console.log('— NFTSaleManager.paused → unpause()');
    await (await nsm.unpause()).wait();
  }
  console.log(`— setNFTPrice(${NFT_PRICE_LEVEL}, ${NFT_PRICE_USD})`);
  await (await nsm.setNFTPrice(NFT_PRICE_LEVEL, NFT_PRICE_USD)).wait();

  // ———————————— 5. IBITINFT: unpause + USDT-параметры ————————————
  const INFT = await ethers.getContractFactory('IBITINFT');
  const inft = INFT.attach(IBITINFT_ADDRESS);

  if (await inft.paused()) {
    console.log('— IBITINFT.paused → unpause()');
    await (await inft.unpause()).wait();
  }
  console.log(`— setUSDTParameters(${USDT_TOKEN_ADDRESS}, ${NFT_PRICE_IBI_USDT})`);
  await (await inft.setUSDTParameters(USDT_TOKEN_ADDRESS, NFT_PRICE_IBI_USDT)).wait();

  console.log('\n✅ Все контракты сконфигурированы.\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Ошибка configure-production:', err);
    process.exit(1);
  });
