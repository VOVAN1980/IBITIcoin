// Ликвидность IBITI/USDT на PancakeSwap V2: первая и последующие доливки.
// Правила после V1: approve ровно на сумму и обратно в 0, в том числе после сбоя.
// Первая ликвидность: минимумы = точным суммам, чужая пара с резервами — отказ.
// Доливка: только по явному разрешению и только если цена пула рядом с ожидаемой.
const { ethers } = require("ethers");
const { usdtForIbiti, impliedPrice } = require("./pool-math");

const PANCAKE = {
  56: { router: "0x10ED43C718714eb63d5aA57B78B54704E256024E", usdt: "0x55d398326f99059fF775485246999027B3197955" },
  97: { router: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3", usdt: null }, // USDT в testnet — через TESTNET_USDT
};

const TOPUP_SLIPPAGE_BPS = 100n; // 1%
const MAX_PRICE_DEVIATION_BPS = 200n; // 2%

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];
const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const PAIR_ABI = [
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
];

// Считает суммы и проверяет условия. Ничего не отправляет.
async function planLiquidity({ signer, tokenAddress, usdtAddress, routerAddress, ibitiHuman, priceUsdt, allowTopup = false }) {
  const me = await signer.getAddress();
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const usdt = new ethers.Contract(usdtAddress, ERC20_ABI, signer);
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);
  const decI = Number(await token.decimals());
  const decU = Number(await usdt.decimals());

  const ibitiAmount = ethers.parseUnits(ibitiHuman, decI);
  const expectedUsdt = usdtForIbiti(ibitiAmount, priceUsdt, decI, decU);
  let usdtAmount = expectedUsdt;
  let mode = "first";
  const problems = [];

  const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, signer);
  const pairAddress = await factory.getPair(tokenAddress, usdtAddress);
  if (pairAddress !== ethers.ZeroAddress) {
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, signer);
    const [r0, r1] = await pair.getReserves();
    if (r0 !== 0n || r1 !== 0n) {
      const tokenIs0 = (await pair.token0()).toLowerCase() === tokenAddress.toLowerCase();
      const [rI, rU] = tokenIs0 ? [r0, r1] : [r1, r0];
      const poolPrice = impliedPrice(rI, rU, decI, decU);
      if (!allowTopup) {
        problems.push(`пара ${pairAddress} уже есть, цена в ней ${poolPrice} USDT — первую ликвидность не добавляем`);
      } else {
        mode = "topup";
        usdtAmount = (ibitiAmount * rU) / rI;
        const diff = usdtAmount > expectedUsdt ? usdtAmount - expectedUsdt : expectedUsdt - usdtAmount;
        if (diff * 10_000n > expectedUsdt * MAX_PRICE_DEVIATION_BPS) {
          problems.push(`цена пула ${poolPrice} USDT отличается от ожидаемой ${priceUsdt} больше чем на 2%`);
        }
      }
    } else {
      // Пустая пара, но токены уже лежат: первая ликвидность засчитает их и получит чужую цену
      const [dI, dU] = await Promise.all([token.balanceOf(pairAddress), usdt.balanceOf(pairAddress)]);
      if (dI !== 0n || dU !== 0n) {
        problems.push(`в пустой паре ${pairAddress} лежат токены: ${ethers.formatUnits(dI, decI)} IBITI и ${ethers.formatUnits(dU, decU)} USDT — первую ликвидность не добавляем`);
      }
    }
  }

  if (ibitiAmount === 0n || usdtAmount === 0n) problems.push("сумма IBITI или USDT получилась 0");
  const balI = await token.balanceOf(me);
  const balU = await usdt.balanceOf(me);
  if (balI < ibitiAmount) problems.push(`на ${me} ${ethers.formatUnits(balI, decI)} IBITI, нужно ${ethers.formatUnits(ibitiAmount, decI)}`);
  if (balU < usdtAmount) problems.push(`на ${me} ${ethers.formatUnits(balU, decU)} USDT, нужно ${ethers.formatUnits(usdtAmount, decU)}`);

  const keep = mode === "topup" ? 10_000n - TOPUP_SLIPPAGE_BPS : 10_000n;
  return {
    signer, me, token, usdt, router, tokenAddress, usdtAddress, routerAddress,
    decI, decU, ibitiAmount, usdtAmount, mode,
    ibitiMin: (ibitiAmount * keep) / 10_000n,
    usdtMin: (usdtAmount * keep) / 10_000n,
    price: usdtAmount === 0n || ibitiAmount === 0n ? "0" : impliedPrice(ibitiAmount, usdtAmount, decI, decU),
    problems,
  };
}

// Возвращает список токенов, по которым разрешение обнулить не удалось.
async function clearAllowances(p) {
  const left = [];
  for (const [name, t] of [["IBITI", p.token], ["USDT", p.usdt]]) {
    try {
      if ((await t.allowance(p.me, p.routerAddress)) !== 0n) await (await t.approve(p.routerAddress, 0)).wait();
    } catch {}
    const rest = await t.allowance(p.me, p.routerAddress).catch(() => null);
    if (rest !== 0n) left.push(name);
  }
  return left;
}

async function addLiquidity(p, deadlineSeconds = 600) {
  if (p.problems.length) throw new Error(p.problems.join("; "));

  let receipt, failure;
  try {
    for (const [t, amount] of [[p.token, p.ibitiAmount], [p.usdt, p.usdtAmount]]) {
      if ((await t.allowance(p.me, p.routerAddress)) !== 0n) await (await t.approve(p.routerAddress, 0)).wait();
      await (await t.approve(p.routerAddress, amount)).wait();
    }
    const deadline = (await p.signer.provider.getBlock("latest")).timestamp + deadlineSeconds;
    receipt = await (
      await p.router.addLiquidity(
        p.tokenAddress, p.usdtAddress,
        p.ibitiAmount, p.usdtAmount,
        p.ibitiMin, p.usdtMin,
        p.me, deadline
      )
    ).wait();
  } catch (e) {
    failure = e;
  }

  // У роутера не должно остаться права трогать кошелёк — и после успеха, и после сбоя.
  const left = await clearAllowances(p);
  const warning = left.length ? `НЕ ОБНУЛЕНЫ разрешения роутеру: ${left.join(", ")}. Запустите обнуление вручную.` : "";

  if (failure) {
    throw new Error(`Ликвидность не добавлена: ${failure.shortMessage || failure.message}. ${warning || "Разрешения роутеру обнулены."}`);
  }

  const factory = new ethers.Contract(await p.router.factory(), FACTORY_ABI, p.signer);
  const pairAddress = await factory.getPair(p.tokenAddress, p.usdtAddress);
  const lp = await new ethers.Contract(pairAddress, PAIR_ABI, p.signer).balanceOf(p.me);
  return { tx: receipt.hash, pairAddress, lp, allowancesLeft: left, warning };
}

module.exports = { PANCAKE, planLiquidity, addLiquidity, clearAllowances };
