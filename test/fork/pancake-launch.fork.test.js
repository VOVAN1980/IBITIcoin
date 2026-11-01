const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { usdtForIbiti } = require("../../scripts/lib/pool-math");
const { PANCAKE, planLiquidity, addLiquidity } = require("../../scripts/lib/liquidity");

// Запуск V2 на копии BSC mainnet: настоящие PancakeSwap V2 и BSC-USDT (18 знаков), IBITI — 8 знаков.
// Работает только с FORK_RPC_URL (иначе пропускается):  FORK_RPC_URL=<bsc rpc> npm run test:fork
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const USDT_BALANCES_SLOT = 1; // BEP20USDT: slot 0 = _owner (Ownable), slot 1 = _balances

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];
const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
  "function getAmountsIn(uint256,address[]) view returns (uint256[])",
  "function swapTokensForExactTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const PAIR_ABI = ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"];

const I = (n) => ethers.parseUnits(String(n), 8); // IBITI
const U = (n) => ethers.parseUnits(String(n), 18); // USDT

async function giveUsdt(to, amount) {
  const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [to, USDT_BALANCES_SLOT]));
  await network.provider.send("hardhat_setStorageAt", [USDT, slot, ethers.toBeHex(amount, 32)]);
}

describe("Fork BSC: пул IBITI V2 / USDT на настоящем PancakeSwap", function () {
  before(function () {
    if (!process.env.FORK_RPC_URL) this.skip();
  });

  it("цена $0.10: покупка 1 / 1 000 IBITI, продажа, без комиссий токена, approve обнулены", async () => {
    const [deployer, liq, buyer] = await ethers.getSigners();
    const usdt = new ethers.Contract(USDT, ERC20_ABI, deployer);
    const router = new ethers.Contract(ROUTER, ROUTER_ABI, deployer);
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 600;

    const token = await ethers.deployContract("IBITI", [[liq.address, deployer.address], [I(1_000_000), I(99_000_000)]]);

    // Ликвидность: 100 000 IBITI по $0.10 → 10 000 USDT (знаки читаем с контрактов)
    const [decI, decU] = [Number(await token.decimals()), Number(await usdt.decimals())];
    expect([decI, decU]).to.deep.equal([8, 18]);
    const liqIbiti = I(100_000);
    const liqUsdt = usdtForIbiti(liqIbiti, "0.10", decI, decU);
    expect(liqUsdt).to.equal(U(10_000));

    await giveUsdt(liq.address, liqUsdt);
    await giveUsdt(buyer.address, U(1_000));
    expect(await usdt.balanceOf(liq.address)).to.equal(liqUsdt);

    await token.connect(liq).approve(ROUTER, liqIbiti);
    await usdt.connect(liq).approve(ROUTER, liqUsdt);
    await router.connect(liq).addLiquidity(token.target, USDT, liqIbiti, liqUsdt, liqIbiti, liqUsdt, liq.address, deadline);

    // approve израсходован ровно — у роутера не осталось права трогать кошелёк
    expect(await token.allowance(liq.address, ROUTER)).to.equal(0n);
    expect(await usdt.allowance(liq.address, ROUTER)).to.equal(0n);

    const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, deployer);
    const pair = new ethers.Contract(await factory.getPair(token.target, USDT), PAIR_ABI, deployer);
    const [r0, r1] = await pair.getReserves();
    const tokenIs0 = (await pair.token0()).toLowerCase() === token.target.toLowerCase();
    expect(tokenIs0 ? r0 : r1).to.equal(liqIbiti);
    expect(tokenIs0 ? r1 : r0).to.equal(liqUsdt);

    const buyPath = [USDT, token.target];
    const in1 = (await router.getAmountsIn(I(1), buyPath))[0];
    const in1000 = (await router.getAmountsIn(I(1_000), buyPath))[0];
    console.log(`      1 IBITI     = ${ethers.formatUnits(in1, 18)} USDT`);
    console.log(`      1 000 IBITI = ${ethers.formatUnits(in1000, 18)} USDT`);
    expect(in1).to.be.within(U("0.1"), U("0.101"));       // $0.10 + 0.25% Pancake
    expect(in1000).to.be.within(U(100), U(102));          // + сдвиг цены ~1%
    await expect(router.getAmountsIn(I(1_000_000), buyPath)).to.be.reverted; // больше, чем в пуле

    // Покупка 1 000 IBITI: покупатель получает ровно 1 000 — у токена нет комиссий
    await usdt.connect(buyer).approve(ROUTER, in1000);
    await router.connect(buyer).swapTokensForExactTokens(I(1_000), in1000, buyPath, buyer.address, deadline);
    expect(await token.balanceOf(buyer.address)).to.equal(I(1_000));

    // Продажа обратно
    const usdtBefore = await usdt.balanceOf(buyer.address);
    await token.connect(buyer).approve(ROUTER, I(1_000));
    await router.connect(buyer).swapExactTokensForTokens(I(1_000), 0, [token.target, USDT], buyer.address, deadline);
    const got = (await usdt.balanceOf(buyer.address)) - usdtBefore;
    console.log(`      продажа 1 000 IBITI → ${ethers.formatUnits(got, 18)} USDT`);
    expect(got).to.be.within(U(99), U(101));
    expect(await token.balanceOf(buyer.address)).to.equal(0n);
  });

  it("scripts/lib/liquidity: добавляет ровно по плану, обнуляет approve, второй раз в живую пару не пускает", async () => {
    const [deployer, liq] = await ethers.getSigners();
    const { router, usdt: usdtAddress } = PANCAKE[56];
    const token = await ethers.deployContract("IBITI", [[liq.address, deployer.address], [I(1_000_000), I(99_000_000)]]);
    await giveUsdt(liq.address, U(10_000));

    const args = { signer: liq, tokenAddress: token.target, usdtAddress, routerAddress: router, ibitiHuman: "100000", priceUsdt: "0.10" };
    const p = await planLiquidity(args);
    expect(p.problems).to.deep.equal([]);
    expect(p.usdtAmount).to.equal(U(10_000));
    expect(p.price).to.equal("0.1");

    const r = await addLiquidity(p);
    expect(r.lp).to.be.gt(0n);
    const usdt = new ethers.Contract(usdtAddress, ERC20_ABI, liq);
    expect(await token.allowance(liq.address, router)).to.equal(0n);
    expect(await usdt.allowance(liq.address, router)).to.equal(0n);

    const again = await planLiquidity(args);
    expect(again.problems.join(" ")).to.contain("уже есть, цена в ней 0.1");
    await expect(addLiquidity(again)).to.be.rejectedWith(/уже есть/);

    // Доливка по разрешению: цена пула сохраняется, approve снова 0
    await giveUsdt(liq.address, U(1_000));
    const topup = await planLiquidity({ ...args, ibitiHuman: "10000", allowTopup: true });
    expect(topup.mode).to.equal("topup");
    expect(topup.problems).to.deep.equal([]);
    expect(topup.usdtAmount).to.equal(U(1_000));
    await addLiquidity(topup);
    expect(await token.allowance(liq.address, router)).to.equal(0n);
    expect(await usdt.allowance(liq.address, router)).to.equal(0n);

    // Цена пула далеко от ожидаемой: доливка не проходит
    const farOff = await planLiquidity({ ...args, ibitiHuman: "10000", priceUsdt: "0.20", allowTopup: true });
    expect(farOff.problems.join(" ")).to.contain("больше чем на 2%");
  });

  it("сбой при добавлении ликвидности: разрешения роутеру обнуляются, деньги на месте", async () => {
    const [deployer, liq] = await ethers.getSigners();
    const { router, usdt: usdtAddress } = PANCAKE[56];
    const token = await ethers.deployContract("IBITI", [[liq.address, deployer.address], [I(1_000_000), I(99_000_000)]]);
    await giveUsdt(liq.address, U(10_000));

    const p = await planLiquidity({
      signer: liq, tokenAddress: token.target, usdtAddress, routerAddress: router, ibitiHuman: "100000", priceUsdt: "0.10",
    });
    await expect(addLiquidity(p, -3600)).to.be.rejectedWith(/Ликвидность не добавлена[\s\S]*обнулены/); // просроченный дедлайн

    const usdt = new ethers.Contract(usdtAddress, ERC20_ABI, liq);
    expect(await token.allowance(liq.address, router)).to.equal(0n);
    expect(await usdt.allowance(liq.address, router)).to.equal(0n);
    expect(await token.balanceOf(liq.address)).to.equal(I(1_000_000));
    expect(await usdt.balanceOf(liq.address)).to.equal(U(10_000));
  });
});
