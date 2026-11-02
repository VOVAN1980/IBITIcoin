// Случайные серии действий многих людей. После каждого шага проверяются балансы: ни один токен не появляется из ниоткуда.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployAll, I, U, DAY, MONTH, cards } = require("./fixture");

// Повторяемый генератор: при ошибке тот же номер запуска воспроизводит её
const rng = (seed) => {
  let s = BigInt(seed);
  const next = () => (s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn);
  return { int: (n) => Number((next() >> 33n) % BigInt(n)), big: (n) => (next() >> 8n) % n };
};

describe("Атаки: случайные серии", function () {
  for (const seed of [1, 2, 3]) {
    it(`стейкинг, запуск ${seed}: 400 действий, книга всегда сходится`, async () => {
      const c = await deployAll();
      const r = rng(seed);
      const users = [c.alice, c.bob, c.carol, c.mallory];
      for (const u of users) await c.token.connect(u).approve(c.staking.target, ethers.MaxUint256);
      const supply = await c.token.totalSupply();

      const check = async () => {
        let staked = 0n;
        let reserved = 0n;
        for (const u of users) {
          const n = await c.staking.stakeCount(u.address);
          let mine = 0n;
          for (let i = 0n; i < n; i++) {
            const s = await c.staking.stakeInfo(u.address, i);
            mine += s.amount;
            reserved += s.reward;
          }
          staked += mine;
          expect(await c.staking.stakeOf(u.address)).to.equal(mine);
        }
        expect(await c.staking.totalStaked()).to.equal(staked);
        expect(await c.staking.reservedRewards()).to.equal(reserved);
        const bal = await c.token.balanceOf(c.staking.target);
        expect(bal).to.equal(staked + reserved + (await c.staking.freeRewards()));
        expect(await c.token.totalSupply()).to.equal(supply);
      };

      let done = 0;
      for (let step = 0; step < 400; step++) {
        const u = users[r.int(users.length)];
        const n = await c.staking.stakeCount(u.address);
        const id = n > 0n ? r.big(n) : 0n;
        const months = 1 + r.int(12);
        const amount = I(100) + r.big(I(3_000));
        const action = r.int(10);
        let p;
        if (action < 4) p = c.staking.connect(u).stake(amount, months);
        else if (action < 6) p = c.staking.connect(u).unstake(id);
        else if (action < 8) p = c.staking.connect(u).renew(id, amount, months);
        else if (action === 8) p = c.staking.connect(c.mallory).releaseExpired(u.address, id);
        else await network.provider.send("evm_increaseTime", [r.int(45) * DAY]);
        if (p) await p.then((tx) => tx.wait()).then(() => done++).catch(() => {});
        else await network.provider.send("evm_mine");
        if (step % 10 === 0) await check();
      }
      await check();
      expect(done).to.be.greaterThan(100);

      // Все выходят: на контракте остаётся только свободный запас, обещанного не остаётся
      await network.provider.send("evm_increaseTime", [24 * MONTH]);
      await network.provider.send("evm_mine");
      for (const u of users) {
        const n = await c.staking.stakeCount(u.address);
        for (let i = 0n; i < n; i++) await c.staking.connect(u).unstake(i).catch(() => {});
      }
      expect(await c.staking.totalStaked()).to.equal(0n);
      expect(await c.staking.reservedRewards()).to.equal(0n);
      expect(await c.token.balanceOf(c.staking.target)).to.equal(await c.staking.freeRewards());
    });
  }

  it("покупки IBITI и NFT вперемешку со стейкингом: тиражи, USDT и запас сходятся", async () => {
    const c = await deployAll();
    const r = rng(7);
    const users = [c.alice, c.bob, c.carol, c.mallory];
    for (const u of users) {
      await c.usdt.transfer(u.address, U(50_000));
      await c.usdt.connect(u).approve(c.nftSale.target, ethers.MaxUint256);
      await c.usdt.connect(u).approve(c.promo.target, ethers.MaxUint256);
      await c.token.connect(u).approve(c.staking.target, ethers.MaxUint256);
    }
    await c.nft.lowerMaxSupply(2, 6); // маленький тираж, чтобы бонусы и покупки столкнулись
    const reserveStart = await c.usdt.balanceOf(c.reserve.address);
    const promoStart = await c.token.balanceOf(c.promo.target);
    let paid = 0n;
    let promoOut = 0n;

    for (let step = 0; step < 300; step++) {
      const u = users[r.int(users.length)];
      const action = r.int(6);
      if (action < 2) {
        const cardId = 1 + r.int(4);
        const price = await c.nftSale.priceOf(cardId);
        const tx = await c.nftSale.connect(u).buy(cardId, price).catch(() => null);
        if (tx) paid += price;
      } else if (action === 2) {
        const amount = U(10) + r.big(U(90));
        const ref = users[r.int(users.length)].address;
        const used = await c.promo.referralUsed(u.address);
        const before = await c.token.balanceOf(c.promo.target);
        const tx = await c.promo.connect(u).buyWithReferral(amount, ref, 0).catch(() => null);
        if (tx) {
          paid += amount;
          promoOut += before - (await c.token.balanceOf(c.promo.target));
          if (ref === u.address) expect(await c.promo.referralUsed(u.address)).to.equal(used);
        }
      } else if (action === 3) {
        await c.staking.connect(u).stake(I(100), [3, 6, 9, 12][r.int(4)]).catch(() => {});
      } else if (action === 4) {
        const n = await c.staking.stakeCount(u.address);
        if (n > 0n) await c.staking.connect(u).unstake(r.big(n)).catch(() => {});
      } else {
        await network.provider.send("evm_increaseTime", [r.int(100) * DAY]);
        await network.provider.send("evm_mine");
      }
    }

    let total = 0n;
    for (const card of cards) {
      const [minted, max] = await c.nft.supplyOf(card.id);
      expect(minted, card.name).to.be.lte(max);
      total += minted;
    }
    expect(await c.nft.totalSupply()).to.equal(total);
    expect(await c.nft.lastTokenId()).to.equal(total);
    expect((await c.usdt.balanceOf(c.reserve.address)) - reserveStart).to.equal(paid);
    expect(await c.usdt.balanceOf(c.nftSale.target)).to.equal(0n);
    expect(await c.usdt.balanceOf(c.promo.target)).to.equal(0n);
    expect(promoStart - (await c.token.balanceOf(c.promo.target))).to.equal(promoOut);
    expect(total).to.be.greaterThan(0n);
  });
});
