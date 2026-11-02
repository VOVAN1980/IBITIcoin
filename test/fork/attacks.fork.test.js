// Атаки на копии BSC mainnet: настоящие адреса, настоящий байт-код, настоящие USDT и PancakeSwap. В настоящую сеть ничего не уходит.
// Работает только с FORK_RPC_URL (иначе пропускается):
//   FORK_RPC_URL=<архивный bsc rpc> npx hardhat test test/fork/attacks.fork.test.js
const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const { PANCAKE, planLiquidity } = require("../../scripts/lib/liquidity");

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);
const DAY = 86400;

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const USDT_BALANCES_SLOT = 1;

const LEDGERS = {
  Казна: "0xC00dC8E3F4647AAa4791AE58901eDDFE6095adA5",
  Основной: "0x9d8dd8B2CFF7A17967fA0eF19eD5C0b3EBeFDe41",
  Вестинг: "0x1841DE9b1c8bF5244675896b0F4FF96C9331596f",
};
const V1 = {
  token: "0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb",
  promoProxy: "0xcDdACBc10ea1110079405c230b3FBB9B77B81840",
  pair: "0xadfb9f0f810311e9c01c27b380909a5ffc104be0",
};

const main = require("../../deployments/bsc.json");
const ADDR = {
  token: main.token.address,
  vesting: main.vesting.address,
  promo: require("../../deployments/bsc.promo-sale.json").address,
  staking: require("../../deployments/bsc.staking.json").address,
  nft: require("../../deployments/bsc.nft.json").collection.address,
  nftSale: require("../../deployments/bsc.nft.json").sale.address,
};
const NAMES = { token: "IBITI", vesting: "IBITIVesting", promo: "IBITIPromoSale", staking: "IBITIStaking", nft: "IBITICollection", nftSale: "IBITINFTSale" };

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "function burnFrom(address,uint256)",
];
const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
];
const FACTORY_ABI = ["function createPair(address,address) returns (address)", "function getPair(address,address) view returns (address)"];
const PAIR_ABI = ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"];

const giveUsdt = async (to, amount) => {
  const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [to, USDT_BALANCES_SLOT]));
  await network.provider.send("hardhat_setStorageAt", [USDT, slot, ethers.toBeHex(amount, 32)]);
};
const asAccount = async (address) => {
  await network.provider.send("hardhat_impersonateAccount", [address]);
  await network.provider.send("hardhat_setBalance", [address, ethers.toBeHex(ethers.parseEther("10"))]);
  return ethers.getSigner(address);
};
const travel = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};
const deadline = async () => (await ethers.provider.getBlock("latest")).timestamp + 3600;

describe("Fork BSC: атаки на настоящие контракты", function () {
  this.timeout(900000);
  let mallory, alice, c, usdt, snap;

  before(async function () {
    if (!process.env.FORK_RPC_URL) return this.skip();
    [mallory, alice] = await ethers.getSigners();
    c = {};
    for (const [key, name] of Object.entries(NAMES)) c[key] = await ethers.getContractAt(name, ADDR[key]);
    usdt = new ethers.Contract(USDT, ERC20, mallory);
    // Самый первый блок копии читать нельзя: дальше работаем от своего
    await network.provider.send("evm_mine");
  });

  beforeEach(async () => {
    snap = await network.provider.send("evm_snapshot", []);
    await giveUsdt(mallory.address, U(1_000_000));
  });
  afterEach(async () => {
    await network.provider.send("evm_revert", [snap]);
  });

  it("в сети ровно тот код, который проверялся: все 6 контрактов", async () => {
    for (const [key, name] of Object.entries(NAMES)) {
      const fqn = `contracts/${name}.sol:${name}`;
      const build = await artifacts.getBuildInfo(fqn);
      const out = build.output.contracts[`contracts/${name}.sol`][name].evm.deployedBytecode;
      // Хвост с хэшем исходников зависит от окончаний строк в файлах: логику сравниваем без него
      const strip = (hex) => hex.slice(0, -(parseInt(hex.slice(-4), 16) * 2 + 4));
      const local = strip(out.object).split("");
      const chain = strip((await ethers.provider.getCode(ADDR[key])).slice(2)).split("");
      expect(chain.length, name).to.equal(local.length);
      for (const r of Object.values(out.immutableReferences || {}).flat()) {
        for (let i = r.start * 2; i < (r.start + r.length) * 2; i++) {
          local[i] = "0";
          chain[i] = "0";
        }
      }
      expect(chain.join("") === local.join(""), `${name}: код отличается`).to.equal(true);
    }
  });

  it("BNB и функции V1 на настоящих адресах", async () => {
    const supply = await new ethers.Contract(ADDR.token, ["function totalSupply() view returns (uint256)"], mallory).totalSupply();
    for (const [key, address] of Object.entries(ADDR)) {
      await expect(mallory.sendTransaction({ to: address, value: ethers.parseEther("1") }), key).to.be.reverted;
    }
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const purchase = ethers.id("purchaseCoinToken(address,uint256)").slice(0, 10) + abi.encode(["address", "uint256"], [USDT, 100]).slice(2);
    const bnb = ethers.id("purchaseCoinBNB()").slice(0, 10);
    for (const [key, address] of Object.entries(ADDR)) {
      await expect(mallory.sendTransaction({ to: address, data: purchase }), `${key} purchaseCoinToken`).to.be.reverted;
      await expect(mallory.sendTransaction({ to: address, data: bnb, value: ethers.parseEther("1") }), `${key} purchaseCoinBNB`).to.be.reverted;
    }
    const v2 = new ethers.Contract(ADDR.token, ["function totalSupply() view returns (uint256)"], mallory);
    expect(await v2.totalSupply()).to.equal(supply);
  });

  it("V1 закрыт: покупка и за USDT, и за BNB отклоняются, V2 не затронут", async () => {
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const purchase = ethers.id("purchaseCoinToken(address,uint256)").slice(0, 10) + abi.encode(["address", "uint256"], [USDT, 100]).slice(2);
    await usdt.approve(V1.token, 1000);
    await expect(mallory.sendTransaction({ to: V1.token, data: purchase })).to.be.reverted;
    await expect(mallory.sendTransaction({ to: V1.token, data: ethers.id("purchaseCoinBNB()").slice(0, 10), value: ethers.parseEther("1") })).to.be.reverted;
  });

  describe("кошельки", function () {
    it("чужой и даже контракты проекта не снимут IBITI и USDT с Ledger", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      for (const [name, ledger] of Object.entries(LEDGERS)) {
        await expect(token.transferFrom(ledger, mallory.address, 1), name).to.be.reverted;
        await expect(token.burnFrom(ledger, 1), name).to.be.reverted;
        await expect(usdt.transferFrom(ledger, mallory.address, 1), name).to.be.reverted;
        for (const key of ["vesting", "promo", "staking", "nft", "nftSale"]) {
          const contract = await asAccount(ADDR[key]);
          await expect(token.connect(contract).transferFrom(ledger, mallory.address, 1), `${name} через ${key}`).to.be.reverted;
          await expect(usdt.connect(contract).transferFrom(ledger, mallory.address, 1), `${name} через ${key}`).to.be.reverted;
        }
      }
    });

    it("ни один Ledger не оставил разрешений контрактам проекта, роутеру и V1", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      const spenders = { ...ADDR, router: ROUTER, ...V1 };
      for (const [name, ledger] of Object.entries(LEDGERS)) {
        for (const [spender, address] of Object.entries(spenders)) {
          expect(await token.allowance(ledger, address), `IBITI ${name} → ${spender}`).to.equal(0n);
          expect(await usdt.allowance(ledger, address), `USDT ${name} → ${spender}`).to.equal(0n);
        }
      }
    });

    it("ЗАМЕР: украден ключ Основной. Что теряется и что остаётся", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      const reserve = await asAccount(LEDGERS.Основной);
      // Настоящий вкладчик кладёт деньги
      await token.connect(await asAccount(LEDGERS.Казна)).transfer(alice.address, I(10_000));
      await token.connect(alice).approve(ADDR.staking, I(10_000));
      await c.staking.connect(alice).stake(I(10_000), 12);

      const free = await c.staking.freeRewards();
      await c.staking.connect(reserve).withdrawFreeRewards(mallory.address, free);
      await expect(c.staking.connect(reserve).withdrawFreeRewards(mallory.address, 1)).to.be.revertedWithCustomError(c.staking, "ExceedsFreeRewards");
      await expect(c.staking.connect(reserve).rescueToken(ADDR.token, mallory.address, 1)).to.be.revertedWithCustomError(c.staking, "RescueIbitiForbidden");

      await c.promo.connect(reserve).pause();
      const stock = await token.balanceOf(ADDR.promo);
      await c.promo.connect(reserve).withdrawIbiti(mallory.address, stock);
      const wallet = await token.balanceOf(LEDGERS.Основной);

      // Вкладчику всё равно выплачивается всё: вклад и награда
      await travel(360 * DAY);
      const before = await token.balanceOf(alice.address);
      await c.staking.connect(alice).unstake(0);
      expect((await token.balanceOf(alice.address)) - before).to.equal(I(13_000));
      console.log(`      запас стейкинга ${ethers.formatUnits(free, 8)} + запас продажи ${ethers.formatUnits(stock, 8)} + кошелёк ${ethers.formatUnits(wallet, 8)} IBITI; вклады и обещанные награды людей целы`);
    });

    it("ЗАМЕР: украден ключ Вестинг. Сколько можно вынести сегодня", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      const owner = await asAccount(LEDGERS.Вестинг);
      await c.vesting.connect(owner).addMember(mallory.address);
      const open = await c.vesting.available();
      await expect(c.vesting.connect(owner).release(mallory.address, open + 1n)).to.be.revertedWithCustomError(c.vesting, "ExceedsAvailable");
      await c.vesting.connect(owner).release(mallory.address, open);
      expect(await token.balanceOf(mallory.address)).to.equal(open);
      console.log(`      открыто сегодня ${ethers.formatUnits(open, 8)} IBITI из 10 000 000; остальное откроется по графику`);
    });
  });

  describe("настоящие покупки и стейкинг", function () {
    it("карточка за настоящий USDT: деньги на Ledger Основной, тираж -1, разрешения нет", async () => {
      const before = await usdt.balanceOf(LEDGERS.Основной);
      await usdt.approve(ADDR.nftSale, U(10));
      await c.nftSale.connect(mallory).buy(1, U(10));
      expect(await c.nft.ownerOf(1)).to.equal(mallory.address);
      expect(await c.nft.tokenURI(1)).to.equal("https://www.ibiticoin.com/nft/metadata/1.json");
      expect((await usdt.balanceOf(LEDGERS.Основной)) - before).to.equal(U(10));
      expect(await usdt.allowance(mallory.address, ADDR.nftSale)).to.equal(0n);
      const [minted] = await c.nft.supplyOf(1);
      expect(minted).to.equal(1n);
    });

    it("Pandora: вторую не купить, деньги не списываются", async () => {
      await usdt.approve(ADDR.nftSale, U(50_000));
      await c.nftSale.connect(mallory).buy(11, U(50_000));
      await giveUsdt(alice.address, U(50_000));
      await usdt.connect(alice).approve(ADDR.nftSale, U(50_000));
      await expect(c.nftSale.connect(alice).buy(11, U(50_000))).to.be.revertedWithCustomError(c.nft, "SoldOut");
      expect(await usdt.balanceOf(alice.address)).to.equal(U(50_000));
    });

    it("IBITI с бонусом на сайте и настоящий стейкинг: 4 срока, карточки и выплаты точные, карточки продаются", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      await usdt.approve(ADDR.promo, U(100));
      await c.promo.connect(mallory).buyWithReferral(U(100), ethers.ZeroAddress, 0);
      expect(await token.balanceOf(mallory.address)).to.equal(I(1_100));

      await token.approve(ADDR.staking, I(1_000));
      const want = [[3, 2, 105], [6, 3, 112], [9, 4, 120], [12, 5, 130]];
      for (const [months] of want) await c.staking.connect(mallory).stake(I(100), months);
      const free = await c.staking.freeRewards();
      expect(free).to.equal(I(1_000_000 - 5 - 12 - 20 - 30));

      for (const [i, [months, cardId, payout]] of want.entries()) {
        await network.provider.send("evm_setNextBlockTimestamp", [Number(await c.staking.maturityOf(mallory.address, i))]);
        const before = await token.balanceOf(mallory.address);
        await c.staking.connect(mallory).unstake(i);
        expect((await token.balanceOf(mallory.address)) - before, `${months} мес`).to.equal(I(payout));
        const id = await c.nft.lastTokenId();
        expect(await c.nft.cardOf(id)).to.equal(BigInt(cardId));
        expect(await c.nft.tokenURI(id)).to.equal(`https://www.ibiticoin.com/nft/metadata/${cardId}.json`);
        const [minted] = await c.nft.supplyOf(cardId);
        expect(minted).to.equal(2n);
        await c.nft.connect(mallory).transferFrom(mallory.address, alice.address, id);
        expect(await c.nft.ownerOf(id)).to.equal(alice.address);
      }
      expect(await c.nft.balanceOf(mallory.address)).to.equal(4n);
    });

    it("процент с перепродаж на настоящем контракте: 5% на Основной", async () => {
      const [to, amount] = await c.nft.royaltyInfo(1, U(1_000));
      expect(to).to.equal(LEDGERS.Основной);
      expect(amount).to.equal(U(50));
    });
  });

  describe("запуск пула", function () {
    const plan = async (signer) => planLiquidity({ signer, tokenAddress: ADDR.token, usdtAddress: USDT, routerAddress: ROUTER, ibitiHuman: "100", priceUsdt: "0.10" });

    it("чужой пул с искажённой ценой: скрипт запуска отказывается", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      const kazna = await asAccount(LEDGERS.Казна);
      await token.connect(kazna).transfer(mallory.address, I(1_000));
      const router = new ethers.Contract(ROUTER, ROUTER_ABI, mallory);
      await token.approve(ROUTER, I(100));
      await usdt.approve(ROUTER, U(1_000));
      await router.addLiquidity(ADDR.token, USDT, I(100), U(1_000), 0, 0, mallory.address, await deadline());
      await giveUsdt(LEDGERS.Казна, U(100));
      const p = await plan(kazna);
      expect(p.problems.join(" ")).to.include("уже есть");
    });

    it("пустой пул, куда заранее закинули токены: скрипт запуска отказывается", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      const kazna = await asAccount(LEDGERS.Казна);
      const router = new ethers.Contract(ROUTER, ROUTER_ABI, mallory);
      const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, mallory);
      await factory.createPair(ADDR.token, USDT);
      const pair = await factory.getPair(ADDR.token, USDT);
      await giveUsdt(pair, U(50));
      await giveUsdt(LEDGERS.Казна, U(100));
      const p = await plan(kazna);
      expect(p.problems.join(" ")).to.include("лежат токены");
    });

    it("ЗАМЕР: перекуп между сайтом и пулом при разной глубине пула", async () => {
      const token = new ethers.Contract(ADDR.token, ERC20, mallory);
      const kazna = await asAccount(LEDGERS.Казна);
      const router = new ethers.Contract(ROUTER, ROUTER_ABI, mallory);
      const path = [ADDR.token, USDT];
      const rows = [];
      for (const depthUsd of [10, 100, 200, 1_000, 10_000, 100_000]) {
        const s = await network.provider.send("evm_snapshot", []);
        const ibitiSide = I(depthUsd * 10);
        await giveUsdt(LEDGERS.Казна, U(depthUsd));
        await token.connect(kazna).approve(ROUTER, ibitiSide);
        await usdt.connect(kazna).approve(ROUTER, U(depthUsd));
        await router.connect(kazna).addLiquidity(ADDR.token, USDT, ibitiSide, U(depthUsd), 0, 0, LEDGERS.Казна, await deadline());

        await usdt.approve(ADDR.promo, ethers.MaxUint256);
        await token.approve(ROUTER, ethers.MaxUint256);
        let spent = 0n;
        let got = 0n;
        let cycles = 0;
        const stockStart = await token.balanceOf(ADDR.promo);
        for (; cycles < 400; cycles++) {
          // Сначала сделка на максимум, если она уже невыгодна, то на минимум
          let size = U(100);
          let [, , total] = await c.promo.quoteTotalToBuyer(size);
          let out = (await router.getAmountsOut(total, path))[1];
          if (out <= size) {
            size = U(10);
            [, , total] = await c.promo.quoteTotalToBuyer(size);
            out = (await router.getAmountsOut(total, path))[1];
            if (out <= size) break;
          }
          await c.promo.connect(mallory).buyWithReferral(size, ethers.ZeroAddress, 0);
          await router.connect(mallory).swapExactTokensForTokens(await token.balanceOf(mallory.address), 0, path, mallory.address, await deadline());
          spent += size;
          got += out;
        }
        const pairAddr = await new ethers.Contract(await router.factory(), FACTORY_ABI, mallory).getPair(ADDR.token, USDT);
        const pair = new ethers.Contract(pairAddr, PAIR_ABI, mallory);
        const [r0, r1] = await pair.getReserves();
        const tokenIs0 = (await pair.token0()).toLowerCase() === ADDR.token.toLowerCase();
        const [rI, rU] = tokenIs0 ? [r0, r1] : [r1, r0];
        const price = Number(ethers.formatUnits(rU, 18)) / Number(ethers.formatUnits(rI, 8));
        rows.push(`      пул $${depthUsd} с каждой стороны: сделок ${cycles}, вложено $${ethers.formatEther(spent)}, прибыль $${Number(ethers.formatEther(got - spent)).toFixed(2)}, ушло из запаса сайта ${ethers.formatUnits(stockStart - (await token.balanceOf(ADDR.promo)), 8)} IBITI, цена пула стала $${price.toFixed(4)}`);
        await network.provider.send("evm_revert", [s]);
        await giveUsdt(mallory.address, U(1_000_000));
      }
      console.log(rows.join("\n"));
    });
  });
});
