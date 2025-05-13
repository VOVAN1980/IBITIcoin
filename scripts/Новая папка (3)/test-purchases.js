// scripts/test-purchases.js
require('dotenv').config();
const hre        = require('hardhat');
const { ethers } = hre;

async function main() {
  const {
    IBITI_TOKEN_ADDRESS,
    NFTSALEMANAGER_ADDRESS,
    FEE_MANAGER_ADDRESS,
    USDT_TOKEN_ADDRESS
  } = process.env;

  const [buyer] = await ethers.getSigners();
  console.log(`\n> Тестируем покупки с аккаунта: ${buyer.address}\n`);

  // Подключаем контракты
  const ibi  = await ethers.getContractAt('IBITIcoin',      IBITI_TOKEN_ADDRESS,    buyer);
  const fm   = await ethers.getContractAt('FeeManager',     FEE_MANAGER_ADDRESS,    buyer);
  const nsm  = await ethers.getContractAt('NFTSaleManager', NFTSALEMANAGER_ADDRESS, buyer);
  const usdt = await ethers.getContractAt('ERC20Mock',      USDT_TOKEN_ADDRESS,     buyer);

  // Адрес и экземпляр NFTDiscount (единственная декларация)
  const discountAddr = await nsm.nftDiscount(); 
  const discount     = await ethers.getContractAt('NFTDiscount', discountAddr, buyer);

  // 0) (опционально) поднимаем лимит для уровня Normal (0)
  console.log('— Поднимаем monthlyLimit для Normal (0) до 100…');
  await (await discount.setMonthlyLimit(0, 100)).wait();
  console.log('   OK\n');

  // 1) Покупка IBI за BNB
  const balBNB = await ethers.provider.getBalance(buyer.address);
  console.log('Баланс BNB:', ethers.formatEther(balBNB), 'BNB');
  const payBNB = ethers.parseUnits('0.01', 'ether');
  console.log('\n— Покупаем IBI за BNB:', ethers.formatEther(payBNB), 'BNB');
  await (await ibi.purchaseCoinBNB({ value: payBNB })).wait();
  console.log('→ Баланс IBI:', (await ibi.balanceOf(buyer.address)).toString());

  // 2) Накопленные BNB-комиссии
  const feesBNB = await ibi.ownerFunds();
  console.log('BNB-комиссии (ownerFunds):', ethers.formatEther(feesBNB), 'BNB\n');

  // 3) Mint mock-USDT и покупка NFT за USDT (1%)
  const dec        = await usdt.decimals();
  const mintAmount = ethers.parseUnits('10', dec);  // 10 USDT
  console.log('— Mint mock-USDT:', ethers.formatUnits(mintAmount, dec), 'USDT');
  await (await usdt.mint(buyer.address, mintAmount)).wait();
  console.log('Баланс USDT:', ethers.formatUnits(await usdt.balanceOf(buyer.address), dec), 'USDT');

  const priceUSDT = await nsm.getCurrentUSDTPrice(1);
  console.log('\n— Цена NFT 1% за USDT (smallest unit):', priceUSDT.toString());

  console.log('— Approve USDT → NFTSaleManager');
  await (await usdt.approve(NFTSALEMANAGER_ADDRESS, priceUSDT)).wait();

  const uri = `test-uri-${Date.now()}`;
  console.log('— Покупаем NFT с URI:', uri);
  await (await nsm.buyNFTWithUSDT(1, uri)).wait();

  // 4) Проверка баланса NFTDiscount
  const nftBalance = await discount.balanceOf(buyer.address);
  console.log('→ Баланс NFTDiscount ERC721:', nftBalance.toString());

  // 5) Проверка поступлений USDT на IBITIcoin
  const collectedUSDT = await usdt.balanceOf(IBITI_TOKEN_ADDRESS);
  console.log(
    'USDT-поступления на IBITIcoin:',
    ethers.formatUnits(collectedUSDT, dec),
    'USDT'
  );

  console.log('\n✅ Скрипт test-purchases.js выполнен успешно.');
}

main().catch(err => {
  console.error('❌ Ошибка test-purchases.js:', err);
  process.exit(1);
});
