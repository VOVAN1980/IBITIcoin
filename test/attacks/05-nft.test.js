// NFT: получить карточку без оплаты, выпустить сверх тиража, подменить продажу, забрать чужую.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, I, U } = require("./fixture");

describe("Атаки: коллекция и продажа NFT", function () {
  let c;
  const buy = async (user, cardId) => {
    const price = await c.nftSale.priceOf(cardId);
    await c.usdt.connect(user).approve(c.nftSale.target, price);
    await c.nftSale.connect(user).buy(cardId, price);
    return c.nft.lastTokenId();
  };

  beforeEach(async () => {
    c = await deployAll();
  });

  it("выпуск мимо продажи: напрямую, через поддельный контракт, от имени владельца", async () => {
    await expect(c.nft.connect(c.mallory).mint(c.mallory.address, 11)).to.be.revertedWithCustomError(c.nft, "NotSeller");
    await expect(c.nft.connect(c.owner).mint(c.owner.address, 11)).to.be.revertedWithCustomError(c.nft, "NotSeller");
    const bot = await ethers.deployContract("AttackerBot");
    await expect(bot.exec(c.nft.target, c.nft.interface.encodeFunctionData("mint", [bot.target, 11]))).to.be.revertedWithCustomError(c.nft, "NotSeller");
    expect(await c.nft.lastTokenId()).to.equal(0n);
  });

  it("покупка за меньшую цену, за ноль, несуществующей карточки", async () => {
    const price = await c.nftSale.priceOf(11);
    await c.usdt.transfer(c.mallory.address, U(100_000));
    await c.usdt.connect(c.mallory).approve(c.nftSale.target, price);
    await expect(c.nftSale.connect(c.mallory).buy(11, 0)).to.be.revertedWithCustomError(c.nftSale, "PriceChanged");
    await expect(c.nftSale.connect(c.mallory).buy(11, 1)).to.be.revertedWithCustomError(c.nftSale, "PriceChanged");
    await expect(c.nftSale.connect(c.mallory).buy(11, price - 1n)).to.be.revertedWithCustomError(c.nftSale, "PriceChanged");
    await expect(c.nftSale.connect(c.mallory).buy(12, 0)).to.be.revertedWithCustomError(c.nftSale, "NotForSale");
    await expect(c.nftSale.connect(c.mallory).buy(0, 0)).to.be.revertedWithCustomError(c.nftSale, "NotForSale");
    expect(await c.nft.balanceOf(c.mallory.address)).to.equal(0n);
  });

  it("чужое разрешение: покупка за счёт другого человека невозможна", async () => {
    const price = await c.nftSale.priceOf(1);
    await c.usdt.connect(c.alice).approve(c.nftSale.target, price * 100n);
    const before = await c.usdt.balanceOf(c.alice.address);
    await c.usdt.connect(c.mallory).approve(c.nftSale.target, 0);
    await expect(c.nftSale.connect(c.mallory).buy(1, price)).to.be.reverted;
    expect(await c.usdt.balanceOf(c.alice.address)).to.equal(before);
    expect(await c.nft.balanceOf(c.mallory.address)).to.equal(0n);
  });

  it("поддельный USDT: продажа списывает только настоящий", async () => {
    const fake = await ethers.deployContract("TestUSDT");
    await fake.connect(c.owner).approve(c.nftSale.target, U(1_000));
    await c.usdt.connect(c.owner).approve(c.nftSale.target, 0);
    expect(await c.nftSale.paymentToken()).to.equal(c.usdt.target);
    await expect(c.nftSale.connect(c.owner).buy(1, U(10))).to.be.reverted;
  });

  it("сверх тиража нельзя никак: Pandora одна на всех", async () => {
    await c.usdt.transfer(c.alice.address, U(100_000));
    await c.usdt.transfer(c.bob.address, U(100_000));
    await buy(c.alice, 11);
    const price = await c.nftSale.priceOf(11);
    await c.usdt.connect(c.bob).approve(c.nftSale.target, price);
    await expect(c.nftSale.connect(c.bob).buy(11, price)).to.be.revertedWithCustomError(c.nft, "SoldOut");
    const [minted, max] = await c.nft.supplyOf(11);
    expect([minted, max]).to.deep.equal([1n, 1n]);
    await expect(c.nft.lowerMaxSupply(11, 2)).to.be.revertedWithCustomError(c.nft, "BadMaxSupply");
  });

  it("контракт-покупатель не получает обратный вызов при выпуске: повторного входа нет", async () => {
    const bot = await ethers.deployContract("AttackerBot");
    await c.usdt.transfer(bot.target, U(100));
    await bot.exec(c.usdt.target, c.usdt.interface.encodeFunctionData("approve", [c.nftSale.target, U(100)]));
    const buyData = c.nftSale.interface.encodeFunctionData("buy", [1, U(20)]);
    await bot.setHook(c.nftSale.target, buyData);
    await bot.exec(c.nftSale.target, buyData);
    expect(await bot.received()).to.equal(0n);
    expect(await c.nft.balanceOf(bot.target)).to.equal(1n);
  });

  it("враждебный токен оплаты: повторная покупка в момент списания отклоняется", async () => {
    const [owner, reserve] = await ethers.getSigners();
    const bad = await ethers.deployContract("HostileToken", [18]);
    const nft = await ethers.deployContract("IBITICollection", [owner.address, reserve.address]);
    await nft.addCards(["u"], [5]);
    const sale = await ethers.deployContract("IBITINFTSale", [bad.target, nft.target, owner.address, reserve.address]);
    await nft.setSeller(sale.target);
    await sale.setPrices([1], [U(10)]);
    await sale.unpause();
    const bot = await ethers.deployContract("AttackerBot");
    await bad.transfer(bot.target, U(100));
    await bot.exec(bad.target, bad.interface.encodeFunctionData("approve", [sale.target, U(100)]));
    const buyData = sale.interface.encodeFunctionData("buy", [1, U(10)]);
    await bad.arm(bot.target, bot.interface.encodeFunctionData("exec", [sale.target, buyData]));
    await bot.exec(sale.target, buyData);
    expect(await bad.attempts()).to.be.greaterThan(0n);
    expect(await bad.successes()).to.equal(0n);
    expect(await nft.balanceOf(bot.target)).to.equal(1n);
  });

  it("чужую карточку не забрать: ни посторонний, ни владелец контракта, ни продажа", async () => {
    const id = await buy(c.alice, 1);
    await expect(c.nft.connect(c.mallory).transferFrom(c.alice.address, c.mallory.address, id)).to.be.reverted;
    await expect(c.nft.connect(c.owner).transferFrom(c.alice.address, c.owner.address, id)).to.be.reverted;
    await expect(c.nft.connect(c.mallory).approve(c.mallory.address, id)).to.be.reverted;
    expect(await c.nft.ownerOf(id)).to.equal(c.alice.address);
  });

  it("продавец один и назначается один раз: ни себя, ни кошелёк, ни другую продажу", async () => {
    const [owner, reserve] = await ethers.getSigners();
    expect(await c.nft.seller()).to.equal(c.nftSale.target);
    await expect(c.nft.connect(c.owner).setSeller(c.owner.address)).to.be.revertedWithCustomError(c.nft, "SellerAlreadySet");
    const other = await ethers.deployContract("IBITINFTSale", [c.usdt.target, c.nft.target, owner.address, reserve.address]);
    await expect(c.nft.connect(c.owner).setSeller(other.target)).to.be.revertedWithCustomError(c.nft, "SellerAlreadySet");
    await expect(c.nft.connect(c.owner).setSeller(ethers.ZeroAddress)).to.be.revertedWithCustomError(c.nft, "SellerAlreadySet");
  });

  it("новая коллекция: кошелёк продавцом не назначить, до назначения выпуск закрыт", async () => {
    const [owner, reserve] = await ethers.getSigners();
    const nft = await ethers.deployContract("IBITICollection", [owner.address, reserve.address]);
    await nft.addCards(["u"], [5]);
    await expect(nft.setSeller(owner.address)).to.be.revertedWithCustomError(nft, "NotAContract");
    await expect(nft.setSeller(ethers.ZeroAddress)).to.be.revertedWithCustomError(nft, "NotAContract");
    await expect(nft.mint(owner.address, 1)).to.be.revertedWithCustomError(nft, "NotSeller");
    expect(await nft.lastTokenId()).to.equal(0n);
  });

  it("ЗАМЕР: владелец покупает как все. Цену платит, тираж уменьшается, покупка видна в сети, USDT приходят на кошелёк резерва", async () => {
    const price = await c.nftSale.priceOf(1);
    await c.usdt.transfer(c.reserve.address, price);
    const before = await c.usdt.balanceOf(c.reserve.address);
    await c.usdt.connect(c.reserve).approve(c.nftSale.target, price);
    await expect(c.nftSale.connect(c.reserve).buy(1, price)).to.emit(c.nftSale, "Purchased");
    // В основной сети владелец и кошелёк резерва один Ledger: для него покупка стоит только газа
    expect(await c.usdt.balanceOf(c.reserve.address)).to.equal(before);
    const [minted] = await c.nft.supplyOf(1);
    expect(minted).to.equal(1n);
  });

  it("контракт покупает по обычной цене и передаёт карточку: призы потом не потребуют новых прав", async () => {
    const bot = await ethers.deployContract("AttackerBot");
    const price = await c.nftSale.priceOf(1);
    await c.usdt.transfer(bot.target, price);
    await bot.exec(c.usdt.target, c.usdt.interface.encodeFunctionData("approve", [c.nftSale.target, price]));
    await bot.exec(c.nftSale.target, c.nftSale.interface.encodeFunctionData("buy", [1, price]));
    const id = await c.nft.lastTokenId();
    await bot.exec(c.nft.target, c.nft.interface.encodeFunctionData("transferFrom", [bot.target, c.alice.address, id]));
    expect(await c.nft.ownerOf(id)).to.equal(c.alice.address);
  });

  it("владелец: тираж не поднять, цену с неверными знаками не поставить, процент не выше 10%", async () => {
    await expect(c.nft.lowerMaxSupply(1, 2001)).to.be.revertedWithCustomError(c.nft, "BadMaxSupply");
    await expect(c.nft.lowerMaxSupply(1, 2000)).to.be.revertedWithCustomError(c.nft, "BadMaxSupply");
    await expect(c.nftSale.setPrices([1], [10])).to.be.revertedWithCustomError(c.nftSale, "PriceOutOfRange");
    await expect(c.nft.setRoyalty(c.owner.address, 1001)).to.be.revertedWithCustomError(c.nft, "RoyaltyTooHigh");
  });

  describe("ЗАМЕР: что можно с украденным ключом владельца", function () {
    it("коллекция: ни цену сдвинуть, ни выпустить себе бесплатно, ни забрать чужое, ни поднять тираж", async () => {
      const id = await buy(c.alice, 2);
      const price = await c.nftSale.priceOf(1);
      await expect(c.nftSale.connect(c.owner).setPrices([1], [U(1)])).to.be.revertedWithCustomError(c.nftSale, "PriceLocked");
      await expect(c.nftSale.connect(c.owner).setPrices([1], [price * 2n])).to.be.revertedWithCustomError(c.nftSale, "PriceLocked");
      await expect(c.nft.connect(c.owner).setSeller(c.owner.address)).to.be.revertedWithCustomError(c.nft, "SellerAlreadySet");
      await expect(c.nft.connect(c.owner).mint(c.owner.address, 11)).to.be.revertedWithCustomError(c.nft, "NotSeller");
      await expect(c.nft.connect(c.owner).transferFrom(c.alice.address, c.owner.address, id)).to.be.reverted;
      await expect(c.nft.connect(c.owner).lowerMaxSupply(11, 2)).to.be.revertedWithCustomError(c.nft, "BadMaxSupply");
      expect(await c.nft.ownerOf(id)).to.equal(c.alice.address);
    });

    it("можно добавить только одну карточку, 12-ю: её картинку и цену от $1 задаёт владелец", async () => {
      await c.nft.connect(c.owner).addCards(["full"], [3]);
      await expect(c.nft.connect(c.owner).addCards(["copy"], [1])).to.be.revertedWithCustomError(c.nft, "TooManyCards");
    });

    it("вестинг: ключ владельца выдаёт только открытое на сегодня, больше не может", async () => {
      const owner = c.vesting.connect(c.vestOwner);
      await owner.addMember(c.mallory.address);
      const open = await c.vesting.available();
      expect(open).to.equal(I(2_000_000));
      await expect(owner.release(c.mallory.address, open + 1n)).to.be.revertedWithCustomError(c.vesting, "ExceedsAvailable");
    });
  });
});
