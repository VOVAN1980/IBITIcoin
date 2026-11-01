const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const I = (n) => ethers.parseUnits(String(n), 8); // IBITI
const U = (n) => ethers.parseUnits(String(n), 18); // USDT
const PRICE = U("0.10");

describe("IBITIPromoSale — контракт сайта, $0,10", function () {
  let token, usdt, sale, owner, reserve, buyer, buyer2, friend, stranger;

  const deploySale = (over = {}) => {
    const a = {
      pay: usdt.target, ibiti: token.target, owner: owner.address, reserve: reserve.address,
      price: PRICE, bonus: 1000, ref: I(1), min: U(10), max: U(100), ...over,
    };
    return ethers.deployContract("IBITIPromoSale", [a.pay, a.ibiti, a.owner, a.reserve, a.price, a.bonus, a.ref, a.min, a.max]);
  };

  beforeEach(async () => {
    [owner, reserve, buyer, buyer2, friend, stranger] = await ethers.getSigners();
    usdt = await ethers.deployContract("TestUSDT");
    token = await ethers.deployContract("IBITI", [[owner.address], [I(100_000_000)]]);
    sale = await deploySale();
    await token.transfer(sale.target, I(1_000_000)); // запас обычным переводом, без approve
    for (const b of [buyer, buyer2]) {
      await usdt.transfer(b.address, U(1_000));
      await usdt.connect(b).approve(sale.target, ethers.MaxUint256);
    }
  });

  describe("цена", function () {
    it("1 / 1 000 / 1 000 000 IBITI: USDT и IBITI сходятся точно", async () => {
      const rows = [];
      for (const [pay, base] of [["0.1", 1], ["100", 1_000], ["100000", 1_000_000]]) {
        const [bought, bonus, total] = await sale.quoteTotalToBuyer(U(pay));
        expect(bought).to.equal(I(base));
        expect(bonus).to.equal(I(base) / 10n);
        expect(total).to.equal(I(base) + I(base) / 10n);
        rows.push({ "USDT": pay, "IBITI": ethers.formatUnits(bought, 8), "бонус": ethers.formatUnits(bonus, 8), "всего": ethers.formatUnits(total, 8) });
      }
      console.table(rows);
    });

    it("настоящая покупка: 10 USDT → 100 + 10 IBITI; USDT сразу на резерв, на контракте 0", async () => {
      await sale.unpause();
      await sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, 0);
      expect(await token.balanceOf(buyer.address)).to.equal(I(110));
      expect(await usdt.balanceOf(buyer.address)).to.equal(U(990));
      expect(await usdt.balanceOf(reserve.address)).to.equal(U(10));
      expect(await usdt.balanceOf(sale.target)).to.equal(0n);
    });

    it("цена из V1 (100000) и другие неверные цены не ставятся ни при создании, ни потом", async () => {
      const F = await ethers.getContractFactory("IBITIPromoSale");
      await expect(deploySale({ price: 100_000n })).to.be.revertedWithCustomError(F, "PriceOutOfRange");
      await expect(deploySale({ price: 0 })).to.be.revertedWithCustomError(F, "PriceOutOfRange");
      await expect(deploySale({ price: U(11) })).to.be.revertedWithCustomError(F, "PriceOutOfRange");
      await expect(sale.setPrice(100_000n)).to.be.revertedWithCustomError(sale, "PriceOutOfRange");
      await expect(sale.setPrice(U("0.000999"))).to.be.revertedWithCustomError(sale, "PriceOutOfRange");
    });

    it("USDT не с 18 знаками или IBITI не с 8 знаками: контракт не создаётся (ловушка testnet V1)", async () => {
      const F = await ethers.getContractFactory("IBITIPromoSale");
      await expect(deploySale({ pay: token.target })).to.be.revertedWithCustomError(F, "WrongDecimals"); // 8 знаков вместо 18
      await expect(deploySale({ ibiti: usdt.target })).to.be.revertedWithCustomError(F, "WrongDecimals"); // 18 вместо 8
    });

    it("минимальный платёж не даёт покупки за ноль: сумма меньше 1 единицы IBITI отклоняется", async () => {
      const tiny = await deploySale({ min: 1n, max: U(100) });
      await token.transfer(tiny.target, I(1));
      await tiny.unpause();
      await usdt.connect(buyer).approve(tiny.target, ethers.MaxUint256);
      await expect(tiny.connect(buyer).buyWithReferral(1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(tiny, "ZeroAmount");
    });
  });

  describe("дыры V1", function () {
    it("IBITI идут только с баланса контракта: кошельки владельца и других не трогаются", async () => {
      const ownerBefore = await token.balanceOf(owner.address);
      await sale.unpause();
      await sale.connect(buyer).buyWithReferral(U(100), ethers.ZeroAddress, 0);
      expect(await token.balanceOf(owner.address)).to.equal(ownerBefore);
      expect(await token.balanceOf(sale.target)).to.equal(I(1_000_000) - I(1_100));
    });

    it("запас кончился: покупка отклоняется, а не берёт откуда-то ещё", async () => {
      const small = await deploySale();
      await token.transfer(small.target, I(109));
      await small.unpause();
      await usdt.connect(buyer).approve(small.target, ethers.MaxUint256);
      await expect(small.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(small, "InsufficientInventory").withArgs(I(110), I(109));
      expect(await usdt.balanceOf(buyer.address)).to.equal(U(1_000));
    });

    it("без approve USDT покупки нет", async () => {
      await sale.unpause();
      await expect(sale.connect(stranger).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.reverted;
      expect(await token.balanceOf(stranger.address)).to.equal(0n);
    });

    it("счётчик учитывает всё: всего = остаток + продано + бонус + реферал", async () => {
      await sale.unpause();
      await sale.connect(buyer).buyWithReferral(U(100), friend.address, 0);
      const [total, bonusSpent, refSpent] = await sale.getStats();
      expect(total).to.equal(I(1_000_000));
      expect(bonusSpent).to.equal(I(100));
      expect(refSpent).to.equal(I(1));
      expect(await sale.soldTotal()).to.equal(I(1_000));
      expect(await sale.poolRemaining()).to.equal(await token.balanceOf(sale.target));
      expect(await sale.poolRemaining()).to.equal(I(1_000_000) - I(1_101));
    });
  });

  describe("условия покупки", function () {
    it("контракт создаётся на паузе: до запуска купить нельзя, а вызвать напрямую тоже", async () => {
      expect(await sale.paused()).to.equal(true);
      await expect(sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.revertedWith("Pausable: paused");
    });

    it("лимиты $10 и $100", async () => {
      await sale.unpause();
      await expect(sale.connect(buyer).buyWithReferral(U(10) - 1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sale, "AmountBelowMin");
      await expect(sale.connect(buyer).buyWithReferral(U(100) + 1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sale, "AmountAboveMax");
      await sale.connect(buyer).buyWithReferral(U(100), ethers.ZeroAddress, 0);
    });

    it("промо можно выключить и задать срок", async () => {
      await sale.unpause();
      await sale.setPromoActive(false);
      await expect(sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sale, "PromoInactive");
      await sale.setPromoActive(true);

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await sale.setPromoEndTime(now + 100);
      await sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, 0);
      await network.provider.send("evm_increaseTime", [200]);
      await network.provider.send("evm_mine");
      await expect(sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(sale, "PromoEnded");
    });

    it("minIbitiOut защищает покупателя", async () => {
      await sale.unpause();
      await expect(sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, I(100) + 1n))
        .to.be.revertedWithCustomError(sale, "Slippage");
      await sale.connect(buyer).buyWithReferral(U(10), ethers.ZeroAddress, I(100));
    });

    it("реферал: +1 IBITI один раз на покупателя, новый реферер не повторяет, себе нельзя", async () => {
      await sale.unpause();
      await sale.connect(buyer).buyWithReferral(U(10), buyer.address, 0); // сам себе
      expect(await sale.refSpent()).to.equal(0n);

      await sale.connect(buyer).buyWithReferral(U(10), friend.address, 0);
      expect(await token.balanceOf(friend.address)).to.equal(I(1));
      await sale.connect(buyer).buyWithReferral(U(10), friend.address, 0);
      await sale.connect(buyer).buyWithReferral(U(10), stranger.address, 0); // другой реферер у того же покупателя
      expect(await token.balanceOf(friend.address)).to.equal(I(1));
      expect(await token.balanceOf(stranger.address)).to.equal(0n);

      await sale.connect(buyer2).buyWithReferral(U(10), friend.address, 0); // другой покупатель
      expect(await token.balanceOf(friend.address)).to.equal(I(2));
    });

    it("событие PromoBuy в том виде, что читает сайт", async () => {
      await sale.unpause();
      await expect(sale.connect(buyer).buyWithReferral(U(10), friend.address, 0))
        .to.emit(sale, "PromoBuy").withArgs(buyer.address, friend.address, U(10), I(100), I(10), I(1));
    });
  });

  describe("управление", function () {
    it("всё только у владельца", async () => {
      const s = sale.connect(stranger);
      const msg = "Ownable: caller is not the owner";
      await expect(s.unpause()).to.be.revertedWith(msg);
      await expect(s.setPrice(U(1))).to.be.revertedWith(msg);
      await expect(s.setBuyLimits(1, 2)).to.be.revertedWith(msg);
      await expect(s.setPromoActive(false)).to.be.revertedWith(msg);
      await expect(s.setPromoEndTime(1)).to.be.revertedWith(msg);
      await expect(s.withdrawIbiti(stranger.address, 1)).to.be.revertedWith(msg);
      await expect(s.rescueToken(usdt.target, stranger.address, 1)).to.be.revertedWith(msg);
    });

    it("цену, лимиты и вывод — только на паузе; после смены цены расчёт новый", async () => {
      await sale.unpause();
      await expect(sale.setPrice(U("0.20"))).to.be.revertedWith("Pausable: not paused");
      await expect(sale.setBuyLimits(U(1), U(2))).to.be.revertedWith("Pausable: not paused");
      await expect(sale.withdrawIbiti(owner.address, 1)).to.be.revertedWith("Pausable: not paused");

      await sale.pause();
      await sale.setPrice(U("0.20"));
      expect(await sale.quoteBoughtAmount(U(10))).to.equal(I(50));
      await expect(sale.setBuyLimits(0, U(1))).to.be.revertedWithCustomError(sale, "BadLimits");
      await expect(sale.setBuyLimits(U(2), U(1))).to.be.revertedWithCustomError(sale, "BadLimits");
      await sale.withdrawIbiti(reserve.address, I(5));
      expect(await token.balanceOf(reserve.address)).to.equal(I(5));
    });

    it("rescue не трогает IBITI, но возвращает чужие токены", async () => {
      await expect(sale.rescueToken(token.target, owner.address, 1)).to.be.revertedWithCustomError(sale, "RescueIbitiForbidden");
      await usdt.transfer(sale.target, U(1));
      await sale.rescueToken(usdt.target, reserve.address, U(1));
      expect(await usdt.balanceOf(reserve.address)).to.equal(U(1));
    });

    it("от владения отказаться нельзя; передача в два шага", async () => {
      await expect(sale.renounceOwnership()).to.be.revertedWithCustomError(sale, "RenounceDisabled");
      await sale.transferOwnership(buyer.address);
      expect(await sale.owner()).to.equal(owner.address);
      await sale.connect(buyer).acceptOwnership();
      expect(await sale.owner()).to.equal(buyer.address);
    });

    it("нет прокси, апгрейда, чужих снятий: белый список функций", async () => {
      const names = [...new Set(sale.interface.fragments.filter((f) => f.type === "function").map((f) => f.name))].sort();
      expect(names).to.deep.equal(
        [
          "IBITI_DECIMALS", "MAX_BONUS_BPS", "MAX_PRICE", "MIN_PRICE", "PAYMENT_DECIMALS",
          "acceptOwnership", "bonusBps", "bonusSpent", "buyWithReferral", "getStats", "ibitiToken",
          "maxPaymentAmount", "minPaymentAmount", "owner", "pause", "paused", "paymentToken", "pendingOwner",
          "poolRemaining", "price", "promoActive", "promoEndTime", "quoteBoughtAmount", "quoteTotalToBuyer",
          "refReward", "refSpent", "referralUsed", "renounceOwnership", "rescueToken", "reserveWallet",
          "setBuyLimits", "setPrice", "setPromoActive", "setPromoEndTime", "soldTotal", "transferOwnership",
          "unpause", "withdrawIbiti",
        ].sort()
      );
    });

    it("отклоняет неверные параметры при создании", async () => {
      const F = await ethers.getContractFactory("IBITIPromoSale");
      await expect(deploySale({ owner: ethers.ZeroAddress })).to.be.revertedWithCustomError(F, "ZeroAddress");
      await expect(deploySale({ reserve: ethers.ZeroAddress })).to.be.revertedWithCustomError(F, "ZeroAddress");
      await expect(deploySale({ bonus: 2001 })).to.be.revertedWithCustomError(F, "BonusTooHigh");
      await expect(deploySale({ min: 0 })).to.be.revertedWithCustomError(F, "BadLimits");
      await expect(deploySale({ min: U(2), max: U(1) })).to.be.revertedWithCustomError(F, "BadLimits");
    });
  });
});
