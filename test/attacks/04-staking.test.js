// Стейкинг: уйти без штрафа, получить награду дважды, забрать чужой вклад, вычерпать запас, получить карточку вкладом.
const { expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const { deployAll, I, DAY, MONTH, nextTxAt, travel, cards } = require("./fixture");
const { closeOldSteps, setupSteps, checkSetup } = require("../../scripts/lib/nft-setup");

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
    it("за секунду до срока: штраф, без награды. Ровно в срок: всё сразу", async () => {
      const a = await stake(c.alice, I(5_000), 6);
      const b = await stake(c.bob, I(5_000), 6);
      const m = await maturity(c.alice, a);

      const aliceBefore = await balance(c.alice);
      await nextTxAt(m - 2n);
      await c.staking.connect(c.alice).unstake(a);
      expect((await balance(c.alice)) - aliceBefore).to.equal(I(4_400));

      const bobBefore = await balance(c.bob);
      const mb = await maturity(c.bob, b);
      await nextTxAt(mb);
      await c.staking.connect(c.bob).unstake(b);
      expect((await balance(c.bob)) - bobBefore).to.equal(I(5_600));
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

    it("награда не получается дважды", async () => {
      const id = await stake(c.alice, I(5_000), 6);
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).unstake(id);
      await expect(c.staking.connect(c.alice).unstake(id)).to.be.revertedWithCustomError(c.staking, "StakeClosed");
      await expect(c.staking.connect(c.alice).renew(id, I(100), 1)).to.be.revertedWithCustomError(c.staking, "StakeClosed");
    });

    it("продление сразу после продления: второй раз уже идёт новый срок", async () => {
      const id = await stake(c.alice, I(1_000), 3);
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).renew(id, I(1_000), 3);
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

    it("продление после окна: без награды", async () => {
      const id = await stake(c.alice, I(1_000), 12);
      await nextTxAt((await maturity(c.alice, id)) + BigInt(30 * DAY) + 1n);
      const before = await balance(c.alice);
      await c.staking.connect(c.alice).renew(id, I(1_000), 1);
      expect(await balance(c.alice)).to.equal(before);
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

    it("пауза не мешает забрать вклад", async () => {
      const id = await stake(c.alice, I(1_000), 1);
      await c.staking.pause();
      await expect(stake(c.bob, I(1_000), 1)).to.be.revertedWith("Pausable: paused");
      await nextTxAt(await maturity(c.alice, id));
      await c.staking.connect(c.alice).unstake(id);
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

  describe("стейкинг и карточки не связаны", function () {
    it("трюк из письма: 50 вкладов по 100 IBITI на 12 месяцев, ни одной карточки", async () => {
      await c.token.connect(c.mallory).approve(c.staking.target, I(5_000));
      for (let i = 0; i < 50; i++) await c.staking.connect(c.mallory).stake(I(100), 12);
      await travel(12 * MONTH);
      for (let i = 0; i < 50; i++) await c.staking.connect(c.mallory).unstake(i);
      expect(await c.nft.balanceOf(c.mallory.address)).to.equal(0n);
    });

    it("крупный вклад на 12 месяцев и продление: токены с наградой, ни одной карточки", async () => {
      const id = await stake(c.alice, I(50_000), 12);
      await nextTxAt(await maturity(c.alice, id));
      const before = await balance(c.alice);
      await c.staking.connect(c.alice).renew(id, I(50_000), 12);
      expect((await balance(c.alice)) - before).to.equal(I(15_000));
      expect(await c.nft.lastTokenId()).to.equal(0n);
    });

    it("выпускает только продажа: стейкинг в коллекции не значится", async () => {
      expect(await c.nft.seller()).to.equal(c.nftSale.target);
    });
  });

  describe("скрипты запуска против чужих действий и ошибок в адресах", function () {
    const names = (steps) => steps.map(([name]) => name);
    let fresh;
    const close = (over = {}) => closeOldSteps({ oldStaking: c.staking, oldSale: c.nftSale, oldNft: c.nft, newStakingAddress: fresh.target, owner: c.owner.address, ...over });
    const setup = (nft, sale, over = {}) => setupSteps({ nft, sale, list: cards, owner: c.owner.address, usdt: c.usdt.target, reserve: c.reserve.address, ...over });
    const errorOf = async (promise) => {
      let error;
      await promise.catch((e) => (error = e));
      expect(error, "должно быть отклонено").to.not.equal(undefined);
      return error.message;
    };
    const collection = () => ethers.deployContract("IBITICollection", [c.owner.address, c.reserve.address]);
    const saleFor = (nft, over = {}) => ethers.deployContract("IBITINFTSale", [over.usdt || c.usdt.target, nft.target, over.owner || c.owner.address, over.reserve || c.reserve.address]);

    // Подделка обычной транзакцией: тот же код и то же хранилище, но одна из копий вписанного адреса другая.
    // Берётся копия, которую геттер не читает: снаружи контракт выглядит настоящим.
    const forge = async (name, genuine, immutableName, fakeAddress) => {
      const build = await artifacts.getBuildInfo(`contracts/${name}.sol:${name}`);
      const def = build.output.sources[`contracts/${name}.sol`].ast.nodes.find((n) => n.nodeType === "ContractDefinition" && n.name === name);
      const variable = def.nodes.find((n) => n.name === immutableName && n.mutability === "immutable");
      const refs = build.output.contracts[`contracts/${name}.sol`][name].evm.deployedBytecode.immutableReferences[String(variable.id)];
      const code = await ethers.provider.getCode(genuine.target);
      let init = "";
      for (let slot = 0; slot < 12; slot++) {
        const value = await ethers.provider.getStorage(genuine.target, slot);
        if (BigInt(value) !== 0n) init += `7f${value.slice(2)}60${slot.toString(16).padStart(2, "0")}55`;
      }
      const real = await genuine[immutableName]();
      for (const at of refs) {
        const runtime = code.slice(2, 2 + at.start * 2) + ethers.zeroPadValue(fakeAddress, at.length).slice(2) + code.slice(2 + (at.start + at.length) * 2);
        const len = (runtime.length / 2).toString(16).padStart(4, "0");
        const offset = (init.length / 2 + 15).toString(16).padStart(4, "0");
        const receipt = await (await c.owner.sendTransaction({ data: `0x${init}61${len}61${offset}60003961${len}6000f3${runtime}` })).wait();
        const forged = new ethers.Contract(receipt.contractAddress, genuine.interface, c.owner);
        if ((await forged[immutableName]()) === real) return forged;
      }
      throw new Error("нет копии, скрытой от геттера");
    };

    beforeEach(async () => {
      fresh = await ethers.deployContract("IBITIStaking", [c.token.target, c.owner.address, I(100)]);
    });

    it("закрытие: чужой вклад не мешает паузе, но запас остаётся на месте", async () => {
      await c.token.connect(c.alice).approve(c.staking.target, I(100));
      await c.staking.connect(c.alice).stake(I(100), 1);
      const free = await c.staking.freeRewards();
      const { steps, inUse } = await close();
      expect(names(steps)).to.deep.equal(["Пауза старого стейкинга", "Пауза старой продажи карточек"]);
      expect(inUse).to.have.length(1);
      for (const [, send] of steps) await send();
      expect(await c.staking.paused()).to.equal(true);
      expect(await c.nftSale.paused()).to.equal(true);
      expect(await c.staking.freeRewards()).to.equal(free);
    });

    it("закрытие: чужая покупка старой карточки не мешает паузе, но запас остаётся на месте", async () => {
      const price = await c.nftSale.priceOf(1);
      await c.usdt.connect(c.alice).approve(c.nftSale.target, price);
      await c.nftSale.connect(c.alice).buy(1, price);
      const { steps, inUse } = await close();
      expect(names(steps)).to.deep.equal(["Пауза старого стейкинга", "Пауза старой продажи карточек"]);
      expect(inUse).to.have.length(1);
    });

    it("закрытие: контракты свободны, запас переносится на новый стейкинг целиком", async () => {
      const free = await c.staking.freeRewards();
      const { steps, inUse } = await close();
      expect(inUse).to.deep.equal([]);
      expect(steps).to.have.length(3);
      for (const [, send] of steps) await send();
      expect(await fresh.freeRewards()).to.equal(free);
      expect(await c.staking.freeRewards()).to.equal(0n);
      expect((await close()).steps).to.deep.equal([]);
    });

    it("перенос: обычный кошелёк вместо стейкинга отклоняется до первой транзакции", async () => {
      const free = await c.staking.freeRewards();
      const before = await c.token.balanceOf(c.mallory.address);
      expect(await errorOf(close({ newStakingAddress: c.mallory.address }))).to.contain("не новый стейкинг");
      expect(await c.staking.paused()).to.equal(false);
      expect(await c.nftSale.paused()).to.equal(false);
      expect(await c.staking.freeRewards()).to.equal(free);
      expect(await c.token.balanceOf(c.mallory.address)).to.equal(before);
    });

    it("перенос: другой контракт, старый адрес, чужой токен и чужой владелец отклоняются", async () => {
      expect(await errorOf(close({ newStakingAddress: c.nftSale.target }))).to.contain("не новый стейкинг");
      expect(await errorOf(close({ newStakingAddress: c.staking.target }))).to.contain("совпадает со старым");
      const otherToken = await ethers.deployContract("IBITI", [[c.owner.address], [I(100_000_000)]]);
      const wrongToken = await ethers.deployContract("IBITIStaking", [otherToken.target, c.owner.address, I(100)]);
      expect(await errorOf(close({ newStakingAddress: wrongToken.target }))).to.contain("другим токеном");
      const wrongOwner = await ethers.deployContract("IBITIStaking", [c.token.target, c.mallory.address, I(100)]);
      expect(await errorOf(close({ newStakingAddress: wrongOwner.target }))).to.contain("владелец нового стейкинга");
    });

    it("перенос: новый стейкинг уже открыт или с вкладами: отклоняется", async () => {
      await c.token.transfer(fresh.target, I(10));
      await fresh.unpause();
      expect(await errorOf(close())).to.contain("на паузе");
      await c.token.connect(c.alice).approve(fresh.target, I(100));
      await fresh.connect(c.alice).stake(I(100), 1);
      await fresh.pause();
      expect(await errorOf(close())).to.contain("уже есть вклады");
    });

    it("перенос: вклад появился после показа плана: перед подписью всё читается заново, перевода нет", async () => {
      const { steps } = await close();
      const free = await c.staking.freeRewards();
      await c.token.connect(c.alice).approve(c.staking.target, I(100));
      await c.staking.connect(c.alice).stake(I(100), 1);
      const left = await c.staking.freeRewards();
      expect(left).to.be.lessThan(free);
      expect(await errorOf(steps[2][1]())).to.contain("есть вклады");
      expect(await c.staking.freeRewards()).to.equal(left);
      expect(await fresh.freeRewards()).to.equal(0n);
    });

    it("перенос: уходит остаток на момент подписи, а не из показанного плана", async () => {
      const { steps } = await close();
      const free = await c.staking.freeRewards();
      await c.token.connect(c.mallory).transfer(c.staking.target, I(5));
      for (const [, send] of steps) await send();
      expect(await fresh.freeRewards()).to.equal(free + I(5));
      expect(await c.staking.freeRewards()).to.equal(0n);
    });

    it("повторный запуск настройки: намеренную паузу не снимает, другую цену не предлагает", async () => {
      await c.nftSale.pause();
      expect(await setup(c.nft, c.nftSale)).to.deep.equal([]);
      const changed = cards.map((card) => (card.id === 3 ? { ...card, price: card.price + 1 } : card));
      expect(await errorOf(setup(c.nft, c.nftSale, { list: changed }))).to.contain("карточки: 3");
    });

    it("настройка: коллекцию, закреплённую за другой продажей, не трогает", async () => {
      const other = await saleFor(c.nft);
      expect(await errorOf(setup(c.nft, other))).to.contain("другой продажей");
    });

    it("настройка: продажа другой коллекции отклоняется до первой транзакции, правильная пара потом проходит", async () => {
      const [a, b] = [await collection(), await collection()];
      const saleB = await saleFor(b);
      expect(await errorOf(setup(a, saleB))).to.contain("другой коллекцией");
      expect(await a.seller()).to.equal(ethers.ZeroAddress);
      expect(await a.cardCount()).to.equal(0n);
      expect(await saleB.paused()).to.equal(true);
      expect(await saleB.priceOf(1)).to.equal(0n);

      const saleA = await saleFor(a);
      for (const [, send] of await setup(a, saleA)) await (await send()).wait();
      expect(await a.seller()).to.equal(saleA.target);
      expect(await checkSetup({ nft: a, sale: saleA, list: cards })).to.deep.equal([]);
    });

    it("настройка: чужой USDT, чужой кошелёк и чужой владелец отклоняются до первой транзакции", async () => {
      const a = await collection();
      const fake = await ethers.deployContract("TestUSDT");
      expect(await errorOf(setup(a, await saleFor(a, { usdt: fake.target })))).to.contain("не тот USDT");
      expect(await errorOf(setup(a, await saleFor(a, { reserve: c.mallory.address })))).to.contain("не на тот кошелёк");
      expect(await errorOf(setup(a, await saleFor(a, { owner: c.mallory.address })))).to.contain("владелец продажи");
      const foreign = await ethers.deployContract("IBITICollection", [c.mallory.address, c.reserve.address]);
      expect(await errorOf(setup(foreign, await saleFor(foreign)))).to.contain("владелец коллекции");
      expect(await a.seller()).to.equal(ethers.ZeroAddress);
      expect(await foreign.seller()).to.equal(ethers.ZeroAddress);
    });

    it("настройка: другой контракт по адресу продажи или коллекции отклоняется, наличия кода мало", async () => {
      const a = await collection();
      const notSale = await ethers.getContractAt("IBITINFTSale", c.usdt.target);
      expect(await errorOf(setup(a, notSale))).to.contain("по адресу продажи");
      const bot = await ethers.deployContract("AttackerBot");
      const botAsSale = await ethers.getContractAt("IBITINFTSale", bot.target);
      expect(await errorOf(setup(a, botAsSale))).to.contain("по адресу продажи");
      const notCollection = await ethers.getContractAt("IBITICollection", c.staking.target);
      expect(await errorOf(setup(notCollection, c.nftSale))).to.contain("по адресу коллекции");
      expect(await a.seller()).to.equal(ethers.ZeroAddress);
    });

    for (const immutableName of ["paymentToken", "collection", "reserveWallet"]) {
      it(`настройка: подделка продажи с другой копией ${immutableName} отклоняется до первой транзакции`, async () => {
        const a = await collection();
        const saleA = await saleFor(a);
        const forged = await forge("IBITINFTSale", saleA, immutableName, c.mallory.address);
        const nonce = await c.owner.getNonce();
        expect(await errorOf(setup(a, forged))).to.contain("по адресу продажи");
        expect(await c.owner.getNonce()).to.equal(nonce);
        expect(await a.seller()).to.equal(ethers.ZeroAddress);
        expect(await a.cardCount()).to.equal(0n);
      });
    }

    it("перенос: подделка нового стейкинга с другой копией токена отклоняется, запас на месте", async () => {
      const otherToken = await ethers.deployContract("IBITI", [[c.owner.address], [I(100_000_000)]]);
      const forged = await forge("IBITIStaking", fresh, "token", otherToken.target);
      expect(await forged.token()).to.equal(c.token.target);
      const free = await c.staking.freeRewards();
      expect(await errorOf(close({ newStakingAddress: forged.target }))).to.contain("не новый стейкинг");
      expect(await c.staking.paused()).to.equal(false);
      expect(await c.staking.freeRewards()).to.equal(free);
    });

    it("настройка: продажа, открытая до настройки, отклоняется; при повторном запуске проверки тоже идут", async () => {
      const a = await collection();
      const saleA = await saleFor(a);
      await saleA.unpause();
      expect(await errorOf(setup(a, saleA))).to.contain("на паузе");
      const lower = cards.map((card) => (card.id === 2 ? { ...card, maxSupply: card.maxSupply - 1 } : card));
      expect(await errorOf(setup(c.nft, c.nftSale, { list: lower }))).to.contain("неверный тираж карточки 2");
      // Шагов нет, а проверки всё равно идут
      expect(await errorOf(setup(c.nft, c.nftSale, { usdt: c.token.target }))).to.contain("не тот USDT");
    });
  });

});
