// scripts/test-all-discounts.js
require('dotenv').config();
const hre        = require('hardhat');
const { ethers } = hre;

async function main() {
  const {
    IBITI_TOKEN_ADDRESS,
    NFTSALEMANAGER_ADDRESS,
    USDT_TOKEN_ADDRESS
  } = process.env;

  const [buyer] = await ethers.getSigners();
  console.log(`\n> Тестируем все уровни скидок с аккаунта: ${buyer.address}\n`);

  // Подключаем контракты
  const ibi  = await ethers.getContractAt('IBITIcoin', IBITI_TOKEN_ADDRESS);
  const nsm  = await ethers.getContractAt('NFTSaleManager', NFTSALEMANAGER_ADDRESS);
  const usdt = await ethers.getContractAt('ERC20Mock', USDT_TOKEN_ADDRESS);

  const dec    = await usdt.decimals();
  const levels = [1,3,5,7,10,15,25,50,75,100];

  // 1) Собираем и минтим общий объём USDT под все уровни
  let totalUSDT = 0n;
  console.log('Собираем цены NFT для уровней:');
  for (const lvl of levels) {
    const p = await nsm.getCurrentUSDTPrice(lvl);
    totalUSDT += p;
    console.log(`  ${lvl}% → ${p.toString()} (smallest unit)`);
  }
  console.log(`\nВсего нужно mock-USDT: ${ethers.formatUnits(totalUSDT, dec)} USDT`);
  await (await usdt.mint(buyer.address, totalUSDT)).wait();
  console.log(`Баланс USDT: ${ethers.formatUnits(await usdt.balanceOf(buyer.address), dec)} USDT`);

  // 2) Approve один раз на всё
  await (await usdt.approve(NFTSALEMANAGER_ADDRESS, totalUSDT)).wait();
  console.log(`Approve NFTSaleManager на ${ethers.formatUnits(totalUSDT, dec)} USDT`);

  // 3) Пробегаем покупки по всем уровням и не падаем при ошибке
  console.log('\n— Запускаем покупки:');
  for (const lvl of levels) {
    const uri = `test-uri-${lvl}-${Date.now()}`;
    try {
      await (await nsm.buyNFTWithUSDT(lvl, uri)).wait();
      console.log(`  [${lvl}%] → куплено (URI=${uri})`);
    } catch (err) {
      // Логируем любую ошибку, но не выходим из цикла
      console.log(`  [${lvl}%] → ОШИБКА: ${err.error?.message || err.message}`);
    }
  }

  // 4) Смотрим итоговые комиссии и баланс NFT
  const feesBNB        = await ibi.ownerFunds();
  const formatFees     = ethers.formatEther(feesBNB);
  const discountAddr   = await nsm.nftDiscount();
  const discountNFT    = await ethers.getContractAt('NFTDiscount', discountAddr);
  const totalMinted    = await discountNFT.balanceOf(buyer.address);

  console.log(`\nBNB-комиссии (ownerFunds): ${formatFees} BNB`);
  console.log(`Всего NFTDiscount на адресе: ${totalMinted.toString()}`);
  console.log('\n✅ Покупки для всех уровней завершены.');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Ошибка test-all-discounts.js:', err);
    process.exit(1);
  });
