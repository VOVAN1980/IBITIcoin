// Расчёт сумм для пула. Знаки (decimals) всегда передаются явно — в скриптах их читают с контракта.
const { ethers } = require("ethers");

// Сколько USDT (в минимальных единицах) стоит ibitiAmount (в минимальных единицах IBITI)
// по цене priceUsdt — строка, USDT за 1 целый IBITI (например "0.10").
function usdtForIbiti(ibitiAmount, priceUsdt, ibitiDecimals, usdtDecimals) {
  const pricePerWhole = ethers.parseUnits(priceUsdt, usdtDecimals);
  return (BigInt(ibitiAmount) * pricePerWhole) / 10n ** BigInt(ibitiDecimals);
}

// Цена 1 целого IBITI в USDT (строка) для пары сумм.
function impliedPrice(ibitiAmount, usdtAmount, ibitiDecimals, usdtDecimals) {
  const scaled = (BigInt(usdtAmount) * 10n ** BigInt(ibitiDecimals)) / BigInt(ibitiAmount);
  return ethers.formatUnits(scaled, usdtDecimals);
}

module.exports = { usdtForIbiti, impliedPrice };
