// Стейкинг: уйти без штрафа, получить награду дважды, забрать чужой вклад, вычерпать запас, потерять карточки из-за газа.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, I, U, DAY, MONTH, nextTxAt, travel } = require("./fixture");

describe("Атаки: стейкинг", function () {
  let c;
  const stake = async (user, amount, months) => {
    await c.token.connect(user).approve(c.staking.target, amount);
    await c.staking.connect(user).stake(amount, months);
    return (await c.staking.stakeCount(user.address)) - 1n;
  };
  const maturity = (user, id) => c.staking.maturityOf(user.address, id);
  const balance = (user) => c.token.balanceOf(user.address);

  beforeEach(async () => {
    c = await deployAll();
  });

  describe("срок и штраф", function () {
    it("за секунду до срока: штраф, без награды и NFT. Ровно в срок: всё сразу", async () => {
      const a = await stake(c.alice, I(1_000), 12);
      const b = await stake(c.bob, I(1_000), 12);
      const m = await maturity(c.alice, a);

      const aliceBefore = await balance(c.alice);
      await nextTxAt(m - 2n);
      await c.staking.connect(c.alice).unstake(a);
      expect((await balance(c.alice)) - aliceBefore).to.equal(I(700));
      expect(await c.nft.balanceOf(c.alice.address)).to.equal(0n);

      const bobBefore = await balance(c.bob);
      const mb = await maturity(c.bob, b);
      await nextTxAt(mb);
      await c.staking.connect(c.bob).unstake(b);
      expect((await balance(c.bob)) - bobBefore).to.equal(I(1_300));
      expect(await c.nft.balanceOf(c.bob.address)).to.equal(2n);
    });

    it("последняя секунда окна: награда есть. Следующая: только вклад", async () => {
      const a = await stake(c.alice, I(1_000), 3);
      const b = await stake(c.bob, I(1_000), 3);
      const end = (await maturity(c.alice, a)) + BigInt(30 * DAY);

      const aliceBefore = await balance(c.alice);
      await nextTxAt(end);
      await c.staking.connect(c.alice).unstake(a);
      expect((await balance(c.alice)) - aliceBefore).to.equal(I(1_050));

      const bobBefore = await balance(c.bob);
      const endB = (await maturity(c.bob, b)) + BigInt(30 * DAY);
      await nextTxAt(endB > end ? endB + 1n : end + 1n);
      await c.staking.connect(c.bob).unstake(b);
      expect((await balance(c.bob)) - bobBefore).to.equal(I(1_000));
      expect(await c.nft.balanceOf(c.bob.address)).to.equal(0n);
    });

    it("короткий вклад не даёт длинную награду, месяцы вне 1–12 отклоняются", async () => {
      for (const months of [0, 13, 255, 256, 257, 268]) {
        await c.token.connect(c.mallory).approve(c.staking.target, I(100));
        await expect(c.staking.connect(c.mallory).stake(I(100), months)).to.be.revertedWithCustomError(c.staking, "BadMonths");
      }
    });

    it("сумма ниже минимума и нулевая отклоняются", async () => {
      await c.token.connect(c.mallory).approve(c.staking.target, I(100));
      await expect(c.staking.connect(c.mallory).stake(I(100) - 1n, 12)).to.be.revertedWithCustomError(c.staking, "BelowMinStake");
      await expect(c.staking.connect(c.mallory).stake(0, 12)).to.be.revertedWithCustomError(c.staking, "BelowMinStake");
    });
  });

  describe("чужое и повторное", function () {
    it("чужой вклад не забрать и не продлить: номер считается по своему кошельку", async () => {
      const id = await stake(c.alice, I(1_000), 3);
      await expect(c.staking.connect(c.mallory).unstake(id)).to.be.revertedWithCustomError(c.staking, "BadStakeId");
      await expect(c.staking.connect(c.mallory).renew(id, I(100), 1)).to.be.revertedWithCustomError(c.staking, "BadStakeId");
      expect(await c.staking.stakeOf(c.alice.address)).to.equal(I(1_000));
    });

    it("награда и карточки не получаются дважды", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).unstake(id);
      await expect(c.staking.connect(c.alice).unstake(id)).to.be.revertedWithCustomError(c.staking, "StakeClosed");
      await expect(c.staking.connect(c.alice).renew(id, I(100), 1)).to.be.revertedWithCustomError(c.staking, "StakeClosed");
      expect(await c.nft.balanceOf(c.alice.address)).to.equal(2n);
    });

    it("продление сразу после продления: второй раз уже идёт новый срок", async () => {
      const id = await stake(c.alice, I(1_000), 3);
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).renew(id, I(1_000), 3);
      expect(await c.nft.balanceOf(c.alice.address)).to.equal(2n);
      await expect(c.staking.connect(c.alice).renew(id, I(1_000), 3)).to.be.revertedWithCustomError(c.staking, "StakeClosed");
      await expect(c.staking.connect(c.alice).renew(id + 1n, I(1_000), 3)).to.be.revertedWithCustomError(c.staking, "StakeStillLocked");
    });

    it("продление в окне считает точно: награда не теряется и не удваивается", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      const before = await balance(c.alice);
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).renew(id, I(1_000), 1);
      expect((await balance(c.alice)) - before).to.equal(I(300));
      expect(await c.staking.stakeOf(c.alice.address)).to.equal(I(1_000));
    });

    it("продление после окна: ни награды, ни карточек", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      await nextTxAt((await maturity(c.alice, id)) + BigInt(30 * DAY) + 1n);
      const before = await balance(c.alice);
      await c.staking.connect(c.alice).renew(id, I(1_000), 1);
      expect(await balance(c.alice)).to.equal(before);
      expect(await c.nft.balanceOf(c.alice.address)).to.equal(0n);
    });

    it("доплата при продлении без разрешения: откат всего, вклад цел", async () => {
      const id = await stake(c.alice, I(1_000), 1);
      await nextTxAt(await maturity(c.alice, id));
      await expect(c.staking.connect(c.alice).renew(id, I(5_000), 1)).to.be.reverted;
      const s = await c.staking.stakeInfo(c.alice.address, id);
      expect(s.amount).to.equal(I(1_000));
      expect(await c.staking.totalStaked()).to.equal(I(1_000));
    });

    it("releaseExpired посторонним: не раньше окна, вклад остаётся за хозяином", async () => {
      const id = await stake(c.alice, I(1_000), 1);
      await expect(c.staking.connect(c.mallory).releaseExpired(c.alice.address, id)).to.be.revertedWithCustomError(c.staking, "WindowNotClosed");
      await nextTxAt(await maturity(c.alice, id));
      await ethers.provider.send("evm_mine", []);
      await expect(c.staking.connect(c.mallory).releaseExpired(c.alice.address, id)).to.be.revertedWithCustomError(c.staking, "WindowNotClosed");
      await travel(31 * DAY);
      const malloryBefore = await balance(c.mallory);
      await c.staking.connect(c.mallory).releaseExpired(c.alice.address, id);
      await expect(c.staking.connect(c.mallory).releaseExpired(c.alice.address, id)).to.be.revertedWithCustomError(c.staking, "RewardAlreadyReleased");
      expect(await balance(c.mallory)).to.equal(malloryBefore);
      const before = await balance(c.alice);
      await c.staking.connect(c.alice).unstake(id);
      expect((await balance(c.alice)) - before).to.equal(I(1_000));
    });
  });

  describe("запас наград", function () {
    it("сверх запаса вклад не принимается, обещанное выплачивается даже после вывода свободного", async () => {
      await c.token.connect(c.owner).approve(c.staking.target, I(10_000_000));
      await expect(c.staking.connect(c.owner).stake(I(3_400_000), 12)).to.be.revertedWithCustomError(c.staking, "RewardPoolExhausted");

      const id = await stake(c.alice, I(10_000), 12);
      const free = await c.staking.freeRewards();
      expect(free).to.equal(I(1_000_000 - 3_000));
      await c.staking.withdrawFreeRewards(c.owner.address, free);
      expect(await c.staking.freeRewards()).to.equal(0n);

      await nextTxAt(await maturity(c.alice, id));
      const before = await balance(c.alice);
      await c.staking.connect(c.alice).unstake(id);
      expect((await balance(c.alice)) - before).to.equal(I(13_000));
    });

    it("владелец не может забрать вклады и обещанные награды", async () => {
      await stake(c.alice, I(10_000), 12);
      const free = await c.staking.freeRewards();
      await expect(c.staking.withdrawFreeRewards(c.owner.address, free + 1n)).to.be.revertedWithCustomError(c.staking, "ExceedsFreeRewards");
      await expect(c.staking.rescueToken(c.token.target, c.owner.address, 1n)).to.be.revertedWithCustomError(c.staking, "RescueIbitiForbidden");
    });

    it("пауза не мешает забрать вклад, новый контракт NFT подставить нельзя", async () => {
      const id = await stake(c.alice, I(1_000), 1);
      await c.staking.pause();
      await expect(stake(c.bob, I(1_000), 1)).to.be.revertedWith("Pausable: paused");
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).unstake(id);
      await expect(c.staking.setNFT(c.token.target)).to.be.revertedWithCustomError(c.staking, "NFTAlreadySet");
    });

    it("вход и досрочный выход по кругу только теряют деньги и пополняют запас", async () => {
      const start = await balance(c.mallory);
      const freeStart = await c.staking.freeRewards();
      for (let i = 0; i < 5; i++) {
        const id = await stake(c.mallory, I(1_000), 12);
        await c.staking.connect(c.mallory).unstake(id);
      }
      expect(start - (await balance(c.mallory))).to.equal(I(1_500));
      expect((await c.staking.freeRewards()) - freeStart).to.equal(I(1_500));
    });

    it("прямой перевод токенов на контракт увеличивает только запас", async () => {
      const free = await c.staking.freeRewards();
      await c.token.connect(c.mallory).transfer(c.staking.target, I(5));
      expect(await c.staking.freeRewards()).to.equal(free + I(5));
      expect(await c.staking.totalStaked()).to.equal(0n);
    });

    it("враждебный токен не проходит повторным входом ни в выход, ни в продление", async () => {
      const [owner] = await ethers.getSigners();
      const bad = await ethers.deployContract("HostileToken", [8]);
      const staking = await ethers.deployContract("IBITIStaking", [bad.target, owner.address, I(100)]);
      await bad.transfer(staking.target, I(1_000_000));
      await staking.unpause();
      const bot = await ethers.deployContract("AttackerBot");
      await bad.transfer(bot.target, I(10_000));
      await bot.exec(bad.target, bad.interface.encodeFunctionData("approve", [staking.target, I(10_000)]));
      await bot.exec(staking.target, staking.interface.encodeFunctionData("stake", [I(1_000), 1]));

      const again = staking.interface.encodeFunctionData("unstake", [0]);
      await bad.arm(bot.target, bot.interface.encodeFunctionData("exec", [staking.target, again]));
      await bot.exec(staking.target, again);
      expect(await bad.attempts()).to.be.greaterThan(0n);
      expect(await bad.successes()).to.equal(0n);
      expect(await staking.totalStaked()).to.equal(0n);
      expect(await bad.balanceOf(staking.target)).to.equal(I(1_000_000) + I(10));
    });
  });

  describe("газ и карточки", function () {
    // try/catch вокруг выдачи NFT: при малом газе выдача падает, а токены уходят.
    it("при любом газе: либо откат всего, либо токены выплачены ровно, карточек не больше 2", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      await travel(12 * MONTH);
      const before = await balance(c.alice);
      const seen = { reverted: 0, skipped: [] };
      for (let gas = 100_000; gas <= 700_000; gas += 25_000) {
        const snap = await ethers.provider.send("evm_snapshot", []);
        const tx = await c.staking.connect(c.alice).unstake(id, { gasLimit: gas }).catch(() => null);
        const receipt = tx ? await tx.wait().catch(() => null) : null;
        if (!receipt) {
          seen.reverted++;
          expect(await c.staking.stakeOf(c.alice.address)).to.equal(I(1_000));
        } else {
          expect((await balance(c.alice)) - before).to.equal(I(1_300));
          const n = await c.nft.balanceOf(c.alice.address);
          expect(n).to.be.lte(2n);
          if (n < 2n) seen.skipped.push([gas, Number(n)]);
          await expect(c.staking.connect(c.alice).unstake(id)).to.be.revertedWithCustomError(c.staking, "StakeClosed");
        }
        await ethers.provider.send("evm_revert", [snap]);
      }
      console.log(`      газ: откатов ${seen.reverted}, успешно без части карточек при лимитах ${JSON.stringify(seen.skipped)}`);
    });

    // Точный перебор вокруг настоящего расхода: есть ли лимит, при котором токены ушли, а карточки потерялись
    const sweep = async (label, send) => {
      const snap0 = await ethers.provider.send("evm_snapshot", []);
      const used = (await (await send(2_000_000)).wait()).gasUsed;
      await ethers.provider.send("evm_revert", [snap0]);
      const lost = [];
      let ok = 0;
      let reverted = 0;
      for (let gas = used; gas <= used + 90_000n; gas += 100n) {
        const snap = await ethers.provider.send("evm_snapshot", []);
        const tx = await send(gas).catch(() => null);
        const receipt = tx ? await tx.wait().catch(() => null) : null;
        if (receipt) {
          ok++;
          const n = await c.nft.balanceOf(c.alice.address);
          if (n < 2n) lost.push([Number(gas), Number(n)]);
        } else reverted++;
        await ethers.provider.send("evm_revert", [snap]);
      }
      console.log(`      ${label}: расход ${used}, перебрано лимитов ${ok + reverted}, откатов ${reverted}, прошло ${ok}, из них с потерей карточек ${lost.length} ${JSON.stringify(lost.slice(0, 6))}`);
      expect(lost, `${label}: при каких лимитах карточки теряются`).to.deep.equal([]);
      return lost;
    };

    it("ЗАМЕР: точный перебор газа, выход с двумя карточками", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      await travel(12 * MONTH);
      await sweep("выход", (gasLimit) => c.staking.connect(c.alice).unstake(id, { gasLimit }));
    });

    it("ЗАМЕР: точный перебор газа, продление с двумя карточками", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      await travel(12 * MONTH);
      await sweep("продление", (gasLimit) => c.staking.connect(c.alice).renew(id, I(1_000), 1, { gasLimit }));
    });

    it("ЗАМЕР: сколько газа нужно на выход с двумя карточками и что даёт оценка кошелька", async () => {
      const a = await stake(c.alice, I(1_000), 12);
      await travel(12 * MONTH);
      const estimate = await c.staking.connect(c.alice).unstake.estimateGas(a);
      const snap = await ethers.provider.send("evm_snapshot", []);
      const full = await (await c.staking.connect(c.alice).unstake(a, { gasLimit: 1_500_000 })).wait();
      await ethers.provider.send("evm_revert", [snap]);
      const tx = await c.staking.connect(c.alice).unstake(a, { gasLimit: estimate });
      const r = await tx.wait();
      console.log(`      оценка ${estimate}, реально с запасом газа ${full.gasUsed}, по оценке потрачено ${r.gasUsed}, карточек ${await c.nft.balanceOf(c.alice.address)}`);
      expect(full.gasUsed).to.be.lt(600_000n);
    });
  });
});
