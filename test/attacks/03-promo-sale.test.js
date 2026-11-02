// Продажа IBITI на сайте: не доплатить, обмануть округлением, накрутить рефералку, вычерпать запас.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, I, U } = require("./fixture");

describe("Атаки: продажа IBITI", function () {
  let c;
  const pay = async (user, amount, referrer = ethers.ZeroAddress, minOut = 0) => {
    await c.usdt.connect(user).approve(c.promo.target, amount);
    return c.promo.connect(user).buyWithReferral(amount, referrer, minOut);
  };

  beforeEach(async () => {
    c = await deployAll();
  });

  it("без оплаты, меньше минимума, больше максимума: отказ и токенов нет", async () => {
    const before = await c.token.balanceOf(c.mallory.address);
    await expect(c.promo.connect(c.mallory).buyWithReferral(0, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.promo, "AmountBelowMin");
    await expect(c.promo.connect(c.mallory).buyWithReferral(1, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.promo, "AmountBelowMin");
    await expect(c.promo.connect(c.mallory).buyWithReferral(U(10) - 1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.promo, "AmountBelowMin");
    await expect(c.promo.connect(c.mallory).buyWithReferral(U(100) + 1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.promo, "AmountAboveMax");
    await expect(c.promo.connect(c.mallory).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.reverted;
    expect(await c.token.balanceOf(c.mallory.address)).to.equal(before);
  });

  it("разрешение меньше суммы: отказ. Чужое разрешение не списывается", async () => {
    await c.usdt.connect(c.mallory).approve(c.promo.target, U(10) - 1n);
    await expect(c.promo.connect(c.mallory).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.reverted;
    await c.usdt.connect(c.mallory).approve(c.promo.target, 0);

    await c.usdt.connect(c.alice).approve(c.promo.target, U(100));
    const aliceBefore = await c.usdt.balanceOf(c.alice.address);
    await expect(c.promo.connect(c.mallory).buyWithReferral(U(100), ethers.ZeroAddress, 0)).to.be.reverted;
    expect(await c.usdt.balanceOf(c.alice.address)).to.equal(aliceBefore);
  });

  it("округление: ни при какой сумме цена не ниже $0.10 с бонусом 10%", async () => {
    for (const raw of [U(10), U(10) + 1n, U(10) + 999n, U("10.000000000000000001"), U("33.333333333333333333"), U("99.999999999999999999"), U(100)]) {
      const [bought, bonus, total] = await c.promo.quoteTotalToBuyer(raw);
      expect(bought * 10n ** 17n / 10n ** 8n).to.be.lte(raw); // не больше, чем оплачено по цене
      expect(bonus).to.be.lte(bought / 10n);
      expect(total).to.equal(bought + bonus);
    }
  });

  it("свой же кошелёк не становится рефералом, рефералка платится один раз", async () => {
    await pay(c.mallory, U(10), c.mallory.address);
    expect(await c.promo.refSpent()).to.equal(0n);

    const before = await c.token.balanceOf(c.alice.address);
    await pay(c.bob, U(10), c.alice.address);
    expect(await c.token.balanceOf(c.alice.address)).to.equal(before + I(1));
    await pay(c.bob, U(10), c.alice.address);
    await pay(c.bob, U(10), c.carol.address);
    expect(await c.token.balanceOf(c.alice.address)).to.equal(before + I(1));
    expect(await c.promo.refSpent()).to.equal(I(1));
  });

  it("стоимость накрутки рефералки: новый кошелёк даёт только 1 IBITI за покупку от $10", async () => {
    // Покупатель с новым кошельком платит $10 и получает 100 IBITI, второй свой кошелёк получает +1 IBITI.
    const before = await c.token.balanceOf(c.mallory.address);
    const buyerBefore = await c.token.balanceOf(c.bob.address);
    await pay(c.bob, U(10), c.mallory.address);
    const got = (await c.token.balanceOf(c.bob.address)) - buyerBefore + (await c.token.balanceOf(c.mallory.address)) - before;
    expect(got).to.equal((await c.promo.quoteTotalToBuyer(U(10)))[2] + I(1));
  });

  it("запас кончился: покупка отклонена целиком, частичной выдачи нет", async () => {
    await c.promo.pause();
    await c.promo.withdrawIbiti(c.owner.address, I(1_000_000 - 50));
    await c.promo.unpause();
    const before = await c.usdt.balanceOf(c.mallory.address);
    await c.usdt.connect(c.mallory).approve(c.promo.target, U(10));
    await expect(c.promo.connect(c.mallory).buyWithReferral(U(10), ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.promo, "InsufficientInventory");
    expect(await c.usdt.balanceOf(c.mallory.address)).to.equal(before);
  });

  it("USDT сразу на кошельке резерва, на контракте ноль", async () => {
    const before = await c.usdt.balanceOf(c.reserve.address);
    await pay(c.mallory, U(55));
    expect(await c.usdt.balanceOf(c.reserve.address)).to.equal(before + U(55));
    expect(await c.usdt.balanceOf(c.promo.target)).to.equal(0n);
    expect(await c.usdt.allowance(c.mallory.address, c.promo.target)).to.equal(0n);
  });

  it("владелец не меняет цену на ходу: сначала пауза, покупатель защищён минимумом токенов", async () => {
    await expect(c.promo.setPrice(U(1))).to.be.revertedWith("Pausable: not paused");
    await expect(c.promo.withdrawIbiti(c.owner.address, 1n)).to.be.revertedWith("Pausable: not paused");
    await expect(c.promo.rescueToken(c.token.target, c.owner.address, 1n)).to.be.revertedWithCustomError(c.promo, "RescueIbitiForbidden");

    const [, , total] = await c.promo.quoteTotalToBuyer(U(10));
    await c.promo.pause();
    await c.promo.setPrice(U(1));
    await c.promo.unpause();
    await c.usdt.connect(c.alice).approve(c.promo.target, U(10));
    const [bought] = await c.promo.quoteTotalToBuyer(U(10));
    await expect(c.promo.connect(c.alice).buyWithReferral(U(10), ethers.ZeroAddress, total * 10n / 11n)).to.be.revertedWithCustomError(c.promo, "Slippage").withArgs(bought, total * 10n / 11n);
  });

  it("враждебный токен оплаты не проходит повторным входом", async () => {
    const [owner, reserve, , , , , mallory] = await ethers.getSigners();
    const bad = await ethers.deployContract("HostileToken", [18]);
    const sale = await ethers.deployContract("IBITIPromoSale", [bad.target, c.token.target, owner.address, reserve.address, U("0.10"), 1000, I(1), U(10), U(100)]);
    await c.token.transfer(sale.target, I(10_000));
    await sale.unpause();
    const bot = await ethers.deployContract("AttackerBot");
    await bad.transfer(bot.target, U(1_000));
    await bot.exec(bad.target, bad.interface.encodeFunctionData("approve", [sale.target, U(1_000)]));
    const buy = sale.interface.encodeFunctionData("buyWithReferral", [U(10), ethers.ZeroAddress, 0]);
    await bad.arm(bot.target, bot.interface.encodeFunctionData("exec", [sale.target, buy]));
    await bot.connect(mallory).exec(sale.target, buy);
    expect(await bad.attempts()).to.be.greaterThan(0n);
    expect(await bad.successes()).to.equal(0n);
    expect(await c.token.balanceOf(bot.target)).to.equal(I(110));
  });
});
