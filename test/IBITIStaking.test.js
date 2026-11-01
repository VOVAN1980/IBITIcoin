const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const I = (n) => ethers.parseUnits(String(n), 8);
const DAY = 86400;
const MONTH = 30 * DAY;
const WINDOW = 30 * DAY;
const LADDER = [1, 3, 5, 7, 10, 12, 14, 18, 20, 22, 25, 30];
const Status = { Closed: 0n, Locked: 1n, Claimable: 2n, Expired: 3n };

const nextTxAt = (ts) => network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
const mineAt = async (ts) => {
  await nextTxAt(ts);
  await network.provider.send("evm_mine");
};

describe("IBITIStaking — стейкинг с запасом наград на контракте", function () {
  let token, staking, nft, owner, alice, bob, stranger, wallet;

  const deployStaking = async (min = I(100), fund = I(1_000_000)) => {
    const c = await ethers.deployContract("IBITIStaking", [token.target, owner.address, min]);
    if (fund > 0n) await token.transfer(c.target, fund);
    await c.unpause();
    for (const u of [alice, bob]) await token.connect(u).approve(c.target, ethers.MaxUint256);
    return c;
  };

  // Баланс контракта всегда сходится: вклады + резерв + свободный запас
  const expectBooksBalanced = async (c = staking) => {
    const [bal, total, reserved, free] = await Promise.all([
      token.balanceOf(c.target), c.totalStaked(), c.reservedRewards(), c.freeRewards(),
    ]);
    expect(bal).to.equal(total + reserved + free);
  };

  const balanceDelta = async (user, fn) => {
    const before = await token.balanceOf(user.address);
    await fn();
    return (await token.balanceOf(user.address)) - before;
  };

  beforeEach(async () => {
    [owner, alice, bob, stranger, wallet] = await ethers.getSigners();
    token = await ethers.deployContract("IBITI", [[owner.address], [I(100_000_000)]]);
    await token.transfer(alice.address, I(2_000_000));
    await token.transfer(bob.address, I(2_000_000));
    staking = await deployStaking();
    nft = await ethers.deployContract("MockJackpotNFT");
  });

  describe("расчёт", function () {
    it("лестница 1–12 месяцев и ничего вне её", async () => {
      for (let m = 1; m <= 12; m++) expect(await staking.rewardPercent(m)).to.equal(BigInt(LADDER[m - 1]));
      await expect(staking.rewardPercent(0)).to.be.revertedWithCustomError(staking, "BadMonths");
      await expect(staking.rewardPercent(13)).to.be.revertedWithCustomError(staking, "BadMonths");
    });

    it("NFT за 3/6/9/12 месяцев, за остальные нет", async () => {
      const want = { 3: 3n, 6: 5n, 9: 7n, 12: 10n };
      for (let m = 1; m <= 12; m++) {
        const [count, discount] = await staking.nftReward(m);
        expect(count).to.equal(want[m] ? 2n : 0n);
        expect(discount).to.equal(want[m] || 0n);
      }
    });

    it("1 / 1 000 / 1 000 000 IBITI на 1, 3, 12 месяцев: в срок и досрочно, настоящие выплаты", async () => {
      const c = await deployStaking(I(1), I(2_000_000));
      const rows = [];
      for (const base of [1, 1_000, 1_000_000]) {
        for (const months of [1, 3, 12]) {
          const pct = BigInt(LADDER[months - 1]);
          const amount = I(base);
          const want = (amount * pct) / 100n;

          let id = await c.stakeCount(alice.address);
          await c.connect(alice).stake(amount, months);
          const early = await balanceDelta(alice, () => c.connect(alice).unstake(id));
          expect(early).to.equal(amount - want);

          id = await c.stakeCount(alice.address);
          await c.connect(alice).stake(amount, months);
          await nextTxAt(await c.maturityOf(alice.address, id));
          const onTime = await balanceDelta(alice, () => c.connect(alice).unstake(id));
          expect(onTime).to.equal(amount + want);

          rows.push({ "вклад": base, "мес": months, "награда": ethers.formatUnits(want, 8), "штраф": ethers.formatUnits(want, 8) });
          await expectBooksBalanced(c);
        }
      }
      console.table(rows);
    });

    it("знаки токена проверяются при создании", async () => {
      const usdt = await ethers.deployContract("TestUSDT");
      const F = await ethers.getContractFactory("IBITIStaking");
      await expect(F.deploy(usdt.target, owner.address, I(100))).to.be.revertedWithCustomError(F, "WrongDecimals");
      await expect(F.deploy(token.target, owner.address, 0)).to.be.revertedWithCustomError(F, "ZeroAmount");
      await expect(F.deploy(token.target, ethers.ZeroAddress, I(100))).to.be.revertedWithCustomError(F, "ZeroAddress");
    });
  });

  describe("вход", function () {
    it("контракт создаётся на паузе: вклад невозможен, пока владелец не включит", async () => {
      const c = await ethers.deployContract("IBITIStaking", [token.target, owner.address, I(100)]);
      expect(await c.paused()).to.equal(true);
      await token.connect(alice).approve(c.target, I(100));
      await expect(c.connect(alice).stake(I(100), 1)).to.be.revertedWith("Pausable: paused");
    });

    it("вклад меньше минимума и неверный срок отклоняются", async () => {
      await expect(staking.connect(alice).stake(I(100) - 1n, 12)).to.be.revertedWithCustomError(staking, "BelowMinStake");
      await expect(staking.connect(alice).stake(0, 12)).to.be.revertedWithCustomError(staking, "BelowMinStake");
      await expect(staking.connect(alice).stake(I(100), 0)).to.be.revertedWithCustomError(staking, "BadMonths");
      await expect(staking.connect(alice).stake(I(100), 13)).to.be.revertedWithCustomError(staking, "BadMonths");
    });

    it("награда резервируется при входе, вклады учитываются отдельно", async () => {
      await staking.connect(alice).stake(I(1_000), 12);
      expect(await staking.totalStaked()).to.equal(I(1_000));
      expect(await staking.reservedRewards()).to.equal(I(300));
      expect(await staking.freeRewards()).to.equal(I(1_000_000) - I(300));
      expect(await staking.stakeOf(alice.address)).to.equal(I(1_000));
      expect(await staking.statusOf(alice.address, 0)).to.equal(Status.Locked);
      await expectBooksBalanced();
    });

    it("запас кончился: новый вклад отклоняется, вошедшие получают всё", async () => {
      const c = await deployStaking(I(100), I(300));
      await c.connect(alice).stake(I(1_000), 12);
      await expect(c.connect(bob).stake(I(1_000), 12))
        .to.be.revertedWithCustomError(c, "RewardPoolExhausted").withArgs(I(300), 0n);

      await nextTxAt(await c.maturityOf(alice.address, 0));
      expect(await balanceDelta(alice, () => c.connect(alice).unstake(0))).to.equal(I(1_300));
      expect(await token.balanceOf(c.target)).to.equal(0n);
    });

    it("запас пополняется обычным переводом, без approve", async () => {
      const c = await deployStaking(I(100), 0n);
      await expect(c.connect(alice).stake(I(1_000), 1)).to.be.revertedWithCustomError(c, "RewardPoolExhausted");
      await token.transfer(c.target, I(10));
      await c.connect(alice).stake(I(1_000), 1);
      expect(await c.freeRewards()).to.equal(0n);
      expect(await token.allowance(owner.address, c.target)).to.equal(0n);
    });
  });

  describe("дыра V1: награды из чужих вкладов", function () {
    it("два вклада по 10 000: второй не вышел бы в V1, здесь оба получают всё", async () => {
      const c = await deployStaking(I(100), I(6_000));
      await c.connect(alice).stake(I(10_000), 12);
      await c.connect(bob).stake(I(10_000), 12);

      await mineAt(await c.maturityOf(bob.address, 0));
      expect(await balanceDelta(alice, () => c.connect(alice).unstake(0))).to.equal(I(13_000));
      expect(await balanceDelta(bob, () => c.connect(bob).unstake(0))).to.equal(I(13_000));
      expect(await token.balanceOf(c.target)).to.equal(0n);
    });

    it("запаса на второго нет: его просто не пускают, вклад первого цел", async () => {
      const c = await deployStaking(I(100), I(3_000));
      await c.connect(alice).stake(I(10_000), 12);
      await expect(c.connect(bob).stake(I(10_000), 12)).to.be.revertedWithCustomError(c, "RewardPoolExhausted");
      expect(await token.balanceOf(c.target)).to.equal(I(13_000));
    });
  });

  describe("выход", function () {
    const stakeAlice = async (amount = I(1_000), months = 12) => {
      const id = await staking.stakeCount(alice.address);
      await staking.connect(alice).stake(amount, months);
      return { id, maturity: await staking.maturityOf(alice.address, id) };
    };

    it("досрочно: штраф по лестнице, без награды и NFT; штраф и резерв уходят в запас", async () => {
      await staking.setNFT(nft.target);
      const freeBefore = await staking.freeRewards();
      const { id } = await stakeAlice();
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(id))).to.equal(I(700));
      expect(await nft.mintCount()).to.equal(0n);
      expect(await staking.reservedRewards()).to.equal(0n);
      expect(await staking.totalStaked()).to.equal(0n);
      expect(await staking.freeRewards()).to.equal(freeBefore + I(300));
      await expectBooksBalanced();
    });

    it("штраф одинаковый: на следующий день и за секунду до срока", async () => {
      const a = await stakeAlice();
      await nextTxAt((await staking.stakeInfo(alice.address, a.id)).start + BigInt(DAY));
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(a.id))).to.equal(I(700));

      const b = await stakeAlice();
      await nextTxAt(b.maturity - 1n);
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(b.id))).to.equal(I(700));
    });

    it("ровно в срок и в последнюю секунду окна: вклад, награда и NFT", async () => {
      await staking.setNFT(nft.target);
      const a = await stakeAlice();
      await nextTxAt(a.maturity);
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(a.id))).to.equal(I(1_300));
      expect(await nft.mintCount()).to.equal(2n);

      const b = await stakeAlice();
      await nextTxAt(b.maturity + BigInt(WINDOW));
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(b.id))).to.equal(I(1_300));
      expect(await nft.mintCount()).to.equal(4n);
      expect((await nft.mints(0)).discountPercent).to.equal(10n);
      expect((await nft.mints(0)).to).to.equal(alice.address);
      await expectBooksBalanced();
    });

    it("секунда после окна: только вклад, награда и NFT сгорают и остаются в запасе", async () => {
      await staking.setNFT(nft.target);
      const freeBefore = await staking.freeRewards();
      const a = await stakeAlice();
      await nextTxAt(a.maturity + BigInt(WINDOW) + 1n);
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(a.id))).to.equal(I(1_000));
      expect(await nft.mintCount()).to.equal(0n);
      expect(await staking.freeRewards()).to.equal(freeBefore);
      expect(await staking.reservedRewards()).to.equal(0n);
      await expectBooksBalanced();
    });

    it("через 30 лет вклад всё ещё можно забрать", async () => {
      const a = await stakeAlice();
      await mineAt(a.maturity + BigInt(30 * 365 * DAY));
      expect(await staking.statusOf(alice.address, a.id)).to.equal(Status.Expired);
      const [payout] = await staking.quoteUnstake(alice.address, a.id);
      expect(payout).to.equal(I(1_000));
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(a.id))).to.equal(I(1_000));
    });

    it("пауза не мешает выйти ни досрочно, ни в срок", async () => {
      const a = await stakeAlice();
      const b = await stakeAlice();
      await staking.pause();
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(a.id))).to.equal(I(700));
      await nextTxAt(b.maturity);
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(b.id))).to.equal(I(1_300));
    });

    it("второй раз забрать нельзя, чужой вклад забрать нельзя", async () => {
      const a = await stakeAlice();
      await expect(staking.connect(bob).unstake(a.id)).to.be.revertedWithCustomError(staking, "BadStakeId");
      await staking.connect(alice).unstake(a.id);
      await expect(staking.connect(alice).unstake(a.id)).to.be.revertedWithCustomError(staking, "StakeClosed");
      expect(await staking.statusOf(alice.address, a.id)).to.equal(Status.Closed);
    });

    it("несколько вкладов живут независимо, номера не сдвигаются", async () => {
      const a = await stakeAlice(I(1_000), 1);
      const b = await stakeAlice(I(2_000), 3);
      const c = await stakeAlice(I(3_000), 12);
      expect(await staking.stakeOf(alice.address)).to.equal(I(6_000));

      await staking.connect(alice).unstake(b.id);
      expect((await staking.stakeInfo(alice.address, a.id)).amount).to.equal(I(1_000));
      expect((await staking.stakeInfo(alice.address, c.id)).amount).to.equal(I(3_000));
      expect(await staking.stakeOf(alice.address)).to.equal(I(4_000));
      await expectBooksBalanced();
    });

    it("подсказка совпадает с выплатой во всех состояниях", async () => {
      const a = await stakeAlice();
      const check = async (status) => {
        const [payout, , , st] = await staking.quoteUnstake(alice.address, a.id);
        expect(st).to.equal(status);
        return payout;
      };
      expect(await check(Status.Locked)).to.equal(I(700));
      await mineAt(a.maturity);
      expect(await check(Status.Claimable)).to.equal(I(1_300));
      await mineAt(a.maturity + BigInt(WINDOW) + 1n);
      expect(await check(Status.Expired)).to.equal(I(1_000));
      await staking.connect(alice).unstake(a.id);
      expect(await check(Status.Closed)).to.equal(0n);
    });
  });

  describe("освобождение резерва", function () {
    let maturity;
    beforeEach(async () => {
      await staking.connect(alice).stake(I(1_000), 12);
      maturity = await staking.maturityOf(alice.address, 0);
    });

    it("до срока и в окне отклоняется", async () => {
      await expect(staking.connect(stranger).releaseExpired(alice.address, 0)).to.be.revertedWithCustomError(staking, "WindowNotClosed");
      await mineAt(maturity);
      await expect(staking.connect(stranger).releaseExpired(alice.address, 0)).to.be.revertedWithCustomError(staking, "WindowNotClosed");
      await mineAt(maturity + BigInt(WINDOW) - 1n);
      await expect(staking.connect(stranger).releaseExpired(alice.address, 0)).to.be.revertedWithCustomError(staking, "WindowNotClosed");
    });

    it("после окна любой возвращает награду в запас: сам ничего не получает, вклад не трогается", async () => {
      await mineAt(maturity + BigInt(WINDOW));
      const free = await staking.freeRewards();
      const got = await balanceDelta(stranger, () => staking.connect(stranger).releaseExpired(alice.address, 0));
      expect(got).to.equal(0n);
      expect(await staking.freeRewards()).to.equal(free + I(300));
      expect(await staking.reservedRewards()).to.equal(0n);
      expect(await staking.totalStaked()).to.equal(I(1_000));
      await expectBooksBalanced();

      await expect(staking.connect(stranger).releaseExpired(alice.address, 0)).to.be.revertedWithCustomError(staking, "RewardAlreadyReleased");
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(0))).to.equal(I(1_000));
      expect(await staking.reservedRewards()).to.equal(0n);
      await expectBooksBalanced();
    });
  });

  describe("продление", function () {
    let maturity;
    beforeEach(async () => {
      await staking.connect(alice).stake(I(1_000), 12);
      maturity = await staking.maturityOf(alice.address, 0);
    });

    it("до срока нельзя: иначе можно уйти от штрафа", async () => {
      await expect(staking.connect(alice).renew(0, I(1_000), 12)).to.be.revertedWithCustomError(staking, "StakeStillLocked");
    });

    it("в окне, вся сумма с наградой: кошелёк не меняется, NFT выданы, новая награда от 1 300", async () => {
      await staking.setNFT(nft.target);
      await nextTxAt(maturity);
      expect(await balanceDelta(alice, () => staking.connect(alice).renew(0, I(1_300), 12))).to.equal(0n);
      expect(await nft.mintCount()).to.equal(2n);

      const s = await staking.stakeInfo(alice.address, 1);
      expect(s.amount).to.equal(I(1_300));
      expect(s.reward).to.equal(I(390));
      expect(await staking.statusOf(alice.address, 0)).to.equal(Status.Closed);
      expect(await staking.totalStaked()).to.equal(I(1_300));
      expect(await staking.reservedRewards()).to.equal(I(390));
      await expectBooksBalanced();
    });

    it("в окне, сумма меньше: разница сразу на кошелёк", async () => {
      await nextTxAt(maturity);
      expect(await balanceDelta(alice, () => staking.connect(alice).renew(0, I(500), 3))).to.equal(I(800));
      expect((await staking.stakeInfo(alice.address, 1)).amount).to.equal(I(500));
      expect(await staking.stakeOf(alice.address)).to.equal(I(500));
      await expectBooksBalanced();
    });

    it("в окне, сумма больше: разница с кошелька", async () => {
      await nextTxAt(maturity);
      expect(await balanceDelta(alice, () => staking.connect(alice).renew(0, I(2_000), 6))).to.equal(-I(700));
      expect((await staking.stakeInfo(alice.address, 1)).reward).to.equal(I(240));
      await expectBooksBalanced();
    });

    it("после окна в зачёт идёт только вклад, награда и NFT сгорели", async () => {
      await staking.setNFT(nft.target);
      const free = await staking.freeRewards();
      await nextTxAt(maturity + BigInt(WINDOW) + 1n);
      expect(await balanceDelta(alice, () => staking.connect(alice).renew(0, I(1_000), 1))).to.equal(0n);
      expect(await nft.mintCount()).to.equal(0n);
      expect(await staking.reservedRewards()).to.equal(I(10));
      expect(await staking.freeRewards()).to.equal(free + I(300) - I(10));
      await expectBooksBalanced();
    });

    it("после освобождения резерва продлить всё ещё можно", async () => {
      await mineAt(maturity + BigInt(WINDOW) + 1n);
      await staking.connect(stranger).releaseExpired(alice.address, 0);
      await staking.connect(alice).renew(0, I(1_000), 1);
      expect(await staking.totalStaked()).to.equal(I(1_000));
      expect(await staking.reservedRewards()).to.equal(I(10));
      await expectBooksBalanced();
    });

    it("запаса на новую награду нет: продление отклоняется, забрать 1 300 можно всё равно", async () => {
      const c = await deployStaking(I(100), I(300));
      await c.connect(alice).stake(I(1_000), 12);
      await nextTxAt(await c.maturityOf(alice.address, 0));
      await expect(c.connect(alice).renew(0, I(1_300), 12))
        .to.be.revertedWithCustomError(c, "RewardPoolExhausted").withArgs(I(390), 0n);
      expect(await balanceDelta(alice, () => c.connect(alice).unstake(0))).to.equal(I(1_300));
      expect(await token.balanceOf(c.target)).to.equal(0n);
    });

    it("старая награда не считается запасом под новую", async () => {
      const c = await deployStaking(I(100), I(300));
      await c.connect(alice).stake(I(1_000), 12);
      await nextTxAt(await c.maturityOf(alice.address, 0));
      await expect(c.connect(alice).renew(0, I(100), 1)).to.be.revertedWithCustomError(c, "RewardPoolExhausted");
    });

    it("на паузе и ниже минимума нельзя; выход при этом открыт", async () => {
      await mineAt(maturity);
      await expect(staking.connect(alice).renew(0, I(1), 1)).to.be.revertedWithCustomError(staking, "BelowMinStake");
      await expect(staking.connect(alice).renew(0, I(1_000), 13)).to.be.revertedWithCustomError(staking, "BadMonths");
      await staking.pause();
      await expect(staking.connect(alice).renew(0, I(1_000), 1)).to.be.revertedWith("Pausable: paused");
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(0))).to.equal(I(1_300));
    });

    it("чужой вклад продлить нельзя", async () => {
      await mineAt(maturity);
      await expect(staking.connect(bob).renew(0, I(1_000), 1)).to.be.revertedWithCustomError(staking, "BadStakeId");
    });
  });

  describe("NFT", function () {
    beforeEach(async () => {
      await staking.connect(alice).stake(I(1_000), 12);
    });

    it("NFT не привязан: токены приходят, в событии видно, что NFT не выдан", async () => {
      await nextTxAt(await staking.maturityOf(alice.address, 0));
      await expect(staking.connect(alice).unstake(0))
        .to.emit(staking, "NFTRewardSkipped").withArgs(alice.address, 10n);
      expect(await token.balanceOf(staking.target)).to.equal(I(1_000_000) - I(300));
    });

    it("контракт NFT упал: токены всё равно приходят", async () => {
      await staking.setNFT(nft.target);
      await nft.setFailing(true);
      await nextTxAt(await staking.maturityOf(alice.address, 0));
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(0))).to.equal(I(1_300));
      expect(await nft.mintCount()).to.equal(0n);
    });

    it("за вклад без NFT по лестнице ничего не выдаётся", async () => {
      await staking.setNFT(nft.target);
      await staking.connect(alice).stake(I(1_000), 1);
      await nextTxAt(await staking.maturityOf(alice.address, 1));
      await staking.connect(alice).unstake(1);
      expect(await nft.mintCount()).to.equal(0n);
    });

    it("адреса NFT не повторяются при выдаче в один блок", async () => {
      await staking.setNFT(nft.target);
      await nextTxAt(await staking.maturityOf(alice.address, 0));
      await staking.connect(alice).unstake(0);
      expect((await nft.mints(0)).uri).to.not.equal((await nft.mints(1)).uri);
    });

    it("привязать можно один раз и только контракт", async () => {
      await expect(staking.setNFT(stranger.address)).to.be.revertedWithCustomError(staking, "NotAContract");
      await expect(staking.connect(stranger).setNFT(nft.target)).to.be.revertedWith("Ownable: caller is not the owner");
      await staking.setNFT(nft.target);
      await expect(staking.setNFT(nft.target)).to.be.revertedWithCustomError(staking, "NFTAlreadySet");
    });
  });

  describe("владелец", function () {
    it("свободный остаток можно вывести, вклады и обещанные награды нельзя", async () => {
      await staking.connect(alice).stake(I(1_000), 12);
      const free = await staking.freeRewards();
      expect(free).to.equal(I(1_000_000) - I(300));

      await expect(staking.withdrawFreeRewards(wallet.address, free + 1n))
        .to.be.revertedWithCustomError(staking, "ExceedsFreeRewards").withArgs(free + 1n, free);
      await staking.withdrawFreeRewards(wallet.address, free);
      expect(await token.balanceOf(wallet.address)).to.equal(free);
      expect(await token.balanceOf(staking.target)).to.equal(I(1_300));
      await expect(staking.withdrawFreeRewards(wallet.address, 1n)).to.be.revertedWithCustomError(staking, "ExceedsFreeRewards");

      await nextTxAt(await staking.maturityOf(alice.address, 0));
      expect(await balanceDelta(alice, () => staking.connect(alice).unstake(0))).to.equal(I(1_300));
    });

    it("штраф и сгоревшая награда становятся доступны владельцу", async () => {
      const free = await staking.freeRewards();
      await staking.connect(alice).stake(I(1_000), 12);
      await staking.connect(alice).unstake(0);
      expect(await staking.freeRewards()).to.equal(free + I(300));

      await staking.connect(bob).stake(I(1_000), 12);
      const m = await staking.maturityOf(bob.address, 0);
      await mineAt(m + BigInt(WINDOW) + 1n);
      await staking.connect(stranger).releaseExpired(bob.address, 0);
      expect(await staking.freeRewards()).to.equal(free + I(300));
    });

    it("посторонний не может ничего из управления", async () => {
      const s = staking.connect(stranger);
      const msg = "Ownable: caller is not the owner";
      await expect(s.pause()).to.be.revertedWith(msg);
      await expect(s.unpause()).to.be.revertedWith(msg);
      await expect(s.setMinStake(1)).to.be.revertedWith(msg);
      await expect(s.withdrawFreeRewards(stranger.address, 1)).to.be.revertedWith(msg);
      await expect(s.rescueToken(token.target, stranger.address, 1)).to.be.revertedWith(msg);
    });

    it("чужие токены можно вернуть, IBITI этим способом нельзя", async () => {
      const usdt = await ethers.deployContract("TestUSDT");
      await usdt.transfer(staking.target, 5n);
      await staking.rescueToken(usdt.target, wallet.address, 5n);
      expect(await usdt.balanceOf(wallet.address)).to.equal(5n);
      await expect(staking.rescueToken(token.target, wallet.address, 1n)).to.be.revertedWithCustomError(staking, "RescueIbitiForbidden");
    });

    it("минимум меняется только на паузе и не ноль", async () => {
      await expect(staking.setMinStake(I(50))).to.be.revertedWith("Pausable: not paused");
      await staking.pause();
      await expect(staking.setMinStake(0)).to.be.revertedWithCustomError(staking, "ZeroAmount");
      await staking.setMinStake(I(50));
      await staking.unpause();
      await staking.connect(alice).stake(I(50), 1);
    });

    it("от владения отказаться нельзя, передача в два шага", async () => {
      await expect(staking.renounceOwnership()).to.be.revertedWithCustomError(staking, "RenounceDisabled");
      await staking.transferOwnership(wallet.address);
      expect(await staking.owner()).to.equal(owner.address);
      await staking.connect(wallet).acceptOwnership();
      expect(await staking.owner()).to.equal(wallet.address);
    });

    it("нет функций сверх этого списка: новая появится только осознанно", async () => {
      const names = [...new Set(staking.interface.fragments.filter((f) => f.type === "function").map((f) => f.name))].sort();
      expect(names).to.deep.equal([
        "CLAIM_WINDOW", "IBITI_DECIMALS", "SECONDS_PER_MONTH", "acceptOwnership", "freeRewards", "maturityOf",
        "minStake", "nft", "nftReward", "owner", "pause", "paused", "pendingOwner", "quoteReward", "quoteUnstake",
        "releaseExpired", "renew", "renounceOwnership", "rescueToken", "reservedRewards", "rewardPercent", "setMinStake",
        "setNFT", "stake", "stakeCount", "stakeInfo", "stakeOf", "statusOf", "token", "totalStaked", "transferOwnership",
        "unpause", "unstake", "withdrawFreeRewards",
      ].sort());
    });
  });
});
