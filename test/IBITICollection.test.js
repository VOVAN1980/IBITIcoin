const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);
const DAY = 86400;

const nextTxAt = (ts) => network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);

describe("IBITICollection и IBITINFTSale — коллекция навсегда за USDT", function () {
  let nft, sale, usdt, owner, reserve, alice, bob, stranger;

  const URIS = Array.from({ length: 11 }, (_, i) => `https://site/nft/${i + 1}.json`);
  const SUPPLY = [1000, 500, 300, 200, 100, 50, 25, 15, 10, 5, 1];
  const PRICES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 50000].map(U);
  const IDS = URIS.map((_, i) => i + 1);

  const buy = async (user = alice, cardId = 1) => {
    const price = await sale.priceOf(cardId);
    await usdt.connect(user).approve(sale.target, price);
    await sale.connect(user).buy(cardId, price);
    return nft.lastTokenId();
  };

  beforeEach(async () => {
    [owner, reserve, alice, bob, stranger] = await ethers.getSigners();
    usdt = await ethers.deployContract("TestUSDT");
    nft = await ethers.deployContract("IBITICollection", [owner.address, reserve.address]);
    sale = await ethers.deployContract("IBITINFTSale", [usdt.target, nft.target, owner.address, reserve.address]);
    await nft.addCards(URIS, SUPPLY);
    await nft.setSeller(sale.target);
    await sale.setPrices(IDS, PRICES);
    await sale.unpause();
    await usdt.transfer(alice.address, U(400_000));
    await usdt.transfer(bob.address, U(400_000));
  });

  describe("покупка", function () {
    it("USDT сразу на кошельке, на контракте ничего, разрешение обнулилось", async () => {
      const id = await buy(alice, 3);
      expect(await nft.ownerOf(id)).to.equal(alice.address);
      expect(await nft.cardOf(id)).to.equal(3n);
      expect(await nft.tokenURI(id)).to.equal(URIS[2]);
      expect(await usdt.balanceOf(reserve.address)).to.equal(PRICES[2]);
      expect(await usdt.balanceOf(sale.target)).to.equal(0n);
      expect(await usdt.balanceOf(nft.target)).to.equal(0n);
      expect(await usdt.allowance(alice.address, sale.target)).to.equal(0n);
    });

    it("у каждой из 11 карточек своя цена, Pandora просто покупается", async () => {
      for (const cardId of IDS) {
        const id = await buy(alice, cardId);
        expect(await nft.cardOf(id)).to.equal(BigInt(cardId));
      }
      const total = PRICES.reduce((a, b) => a + b, 0n);
      expect(await usdt.balanceOf(reserve.address)).to.equal(total);
      expect(await nft.balanceOf(alice.address)).to.equal(11n);
    });

    it("один человек может купить несколько копий одной карточки", async () => {
      await buy(alice, 1);
      await buy(alice, 1);
      expect(await nft.balanceOf(alice.address)).to.equal(2n);
    });

    it("сверх тиража нельзя, деньги не уходят", async () => {
      await buy(alice, 11);
      const price = await sale.priceOf(11);
      await usdt.connect(bob).approve(sale.target, price);
      const before = await usdt.balanceOf(bob.address);
      await expect(sale.connect(bob).buy(11, price)).to.be.revertedWithCustomError(nft, "SoldOut");
      expect(await usdt.balanceOf(bob.address)).to.equal(before);
    });

    it("покупка по другой цене отклоняется", async () => {
      const price = await sale.priceOf(1);
      await usdt.connect(alice).approve(sale.target, price * 2n);
      await expect(sale.connect(alice).buy(1, price - 1n)).to.be.revertedWithCustomError(sale, "PriceChanged");
      await expect(sale.connect(alice).buy(1, price + 1n)).to.be.revertedWithCustomError(sale, "PriceChanged");
    });

    it("без цены не продаётся. Без разрешения и без денег не покупается", async () => {
      await nft.addCards(["u12"], [3]);
      await expect(sale.connect(alice).buy(12, 0)).to.be.revertedWithCustomError(sale, "NotForSale");
      await expect(sale.connect(alice).buy(99, 0)).to.be.revertedWithCustomError(sale, "NotForSale");
      await expect(sale.connect(stranger).buy(2, PRICES[1])).to.be.reverted;
      await usdt.connect(stranger).approve(sale.target, PRICES[1]);
      await expect(sale.connect(stranger).buy(2, PRICES[1])).to.be.reverted;
    });

    it("на паузе покупка закрыта, уже купленный NFT передаётся", async () => {
      const id = await buy(alice, 1);
      await sale.pause();
      await expect(sale.connect(bob).buy(1, PRICES[0])).to.be.revertedWith("Pausable: paused");
      await nft.connect(alice).transferFrom(alice.address, bob.address, id);
      expect(await nft.ownerOf(id)).to.equal(bob.address);
      await sale.unpause();
      await buy(bob, 1);
    });

    it("новая продажа создаётся на паузе", async () => {
      const fresh = await ethers.deployContract("IBITINFTSale", [usdt.target, nft.target, owner.address, reserve.address]);
      expect(await fresh.paused()).to.equal(true);
    });

    it("catalog отдаёт цены и тиражи всех карточек", async () => {
      await buy(alice, 2);
      const [prices, minted, maxSupply] = await sale.catalog();
      expect(prices.length).to.equal(11);
      expect(prices[10]).to.equal(PRICES[10]);
      expect(minted[1]).to.equal(1n);
      expect(minted[0]).to.equal(0n);
      expect(maxSupply[0]).to.equal(1000n);
    });
  });

  describe("навсегда", function () {
    it("через 50 лет NFT на месте и передаётся", async () => {
      const id = await buy(alice, 5);
      await network.provider.send("evm_increaseTime", [50 * 365 * DAY]);
      await network.provider.send("evm_mine");
      expect(await nft.ownerOf(id)).to.equal(alice.address);
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
      expect(await nft.tokenURI(id)).to.equal(URIS[4]);
      await nft.connect(alice).transferFrom(alice.address, bob.address, id);
      expect(await nft.ownerOf(id)).to.equal(bob.address);
    });

    it("в контракте нет сжигания, срока, скидки и паузы", async () => {
      const names = nft.interface.fragments.filter((f) => f.type === "function").map((f) => f.name.toLowerCase());
      for (const bad of ["burn", "expire", "discount", "pause"]) {
        expect(names.filter((n) => n.includes(bad)), bad).to.deep.equal([]);
      }
    });

    it("владелец контракта не может забрать чужой NFT", async () => {
      const id = await buy(alice, 1);
      await expect(nft.connect(owner).transferFrom(alice.address, owner.address, id)).to.be.revertedWith(
        "ERC721: caller is not token owner or approved"
      );
    });
  });

  describe("тираж и карточки", function () {
    it("тираж только вниз и не ниже выпущенного", async () => {
      await buy(alice, 3);
      await expect(nft.lowerMaxSupply(3, 300)).to.be.revertedWithCustomError(nft, "BadMaxSupply");
      await expect(nft.lowerMaxSupply(3, 301)).to.be.revertedWithCustomError(nft, "BadMaxSupply");
      await expect(nft.lowerMaxSupply(3, 0)).to.be.revertedWithCustomError(nft, "BadMaxSupply");
      await nft.lowerMaxSupply(3, 1);
      const [minted, max] = await nft.supplyOf(3);
      expect([minted, max]).to.deep.equal([1n, 1n]);
      await expect(buy(bob, 3)).to.be.revertedWithCustomError(nft, "SoldOut");
    });

    it("полная коллекция добавляется позже и не продаётся, пока нет цены", async () => {
      await nft.addCards(["https://site/nft/12.json"], [3]);
      expect(await nft.cardCount()).to.equal(12n);
      await expect(sale.connect(alice).buy(12, 0)).to.be.revertedWithCustomError(sale, "NotForSale");
      await sale.setPrices([12], [U(100_000)]);
      const id = await buy(alice, 12);
      expect(await nft.tokenURI(id)).to.equal("https://site/nft/12.json");
    });

    it("неверные карточки и цены отклоняются", async () => {
      await expect(nft.addCards(["a"], [0])).to.be.revertedWithCustomError(nft, "BadMaxSupply");
      await expect(nft.addCards(["a", "b"], [1])).to.be.revertedWithCustomError(nft, "BadLength");
      await expect(nft.addCards([], [])).to.be.revertedWithCustomError(nft, "BadLength");
      await expect(nft.cardInfo(0)).to.be.revertedWithCustomError(nft, "UnknownCard");
      await expect(nft.cardInfo(12)).to.be.revertedWithCustomError(nft, "UnknownCard");
      await expect(sale.setPrices([12], [U(10)])).to.be.revertedWithCustomError(nft, "UnknownCard");
      await expect(sale.setPrices([0], [U(10)])).to.be.revertedWithCustomError(nft, "UnknownCard");
      // Цена с неверными знаками: 10 вместо 10 USDT
      await expect(sale.setPrices([1], [10])).to.be.revertedWithCustomError(sale, "PriceOutOfRange");
      await expect(sale.setPrices([1], [U(1_000_001)])).to.be.revertedWithCustomError(sale, "PriceOutOfRange");
      await expect(sale.setPrices([1, 2], [U(10)])).to.be.revertedWithCustomError(sale, "BadLength");
      await expect(sale.setPrices([1], [0])).to.be.revertedWithCustomError(sale, "PriceOutOfRange");
    });

    it("метаданные меняются, пока не закреплены", async () => {
      const id = await buy(alice, 1);
      await nft.setCardURI(1, "ipfs://cid/1.json");
      expect(await nft.tokenURI(id)).to.equal("ipfs://cid/1.json");
      await nft.freezeCardURI(1);
      expect((await nft.cardInfo(1)).uriFrozen).to.equal(true);
      await expect(nft.setCardURI(1, "x")).to.be.revertedWithCustomError(nft, "URIFrozen");
      await expect(nft.tokenURI(9999)).to.be.revertedWith("ERC721: invalid token ID");
    });
  });

  describe("права", function () {
    it("выпускает только продажа", async () => {
      await expect(nft.connect(owner).mint(owner.address, 1)).to.be.revertedWithCustomError(nft, "NotSeller");
      await expect(nft.connect(stranger).mint(stranger.address, 1)).to.be.revertedWithCustomError(nft, "NotSeller");
      expect(await nft.seller()).to.equal(sale.target);
    });

    it("посторонний ничем не управляет", async () => {
      const s = stranger;
      const onlyOwner = "Ownable: caller is not the owner";
      await expect(nft.connect(s).addCards(["a"], [1])).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).lowerMaxSupply(1, 1)).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).setCardURI(1, "a")).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).freezeCardURI(1)).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).setSeller(s.address)).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).setRoyalty(s.address, 100)).to.be.revertedWith(onlyOwner);
      await expect(sale.connect(s).setPrices([1], [U(1)])).to.be.revertedWith(onlyOwner);
      await expect(sale.connect(s).pause()).to.be.revertedWith(onlyOwner);
      await expect(sale.connect(s).unpause()).to.be.revertedWith(onlyOwner);
      await expect(sale.connect(s).rescueToken(usdt.target, 1)).to.be.revertedWith(onlyOwner);
    });

    it("отказ от владения запрещён, передача в два шага", async () => {
      await expect(nft.renounceOwnership()).to.be.revertedWithCustomError(nft, "RenounceDisabled");
      await expect(sale.renounceOwnership()).to.be.revertedWithCustomError(sale, "RenounceDisabled");
      await nft.transferOwnership(bob.address);
      expect(await nft.owner()).to.equal(owner.address);
      await nft.connect(bob).acceptOwnership();
      expect(await nft.owner()).to.equal(bob.address);
    });

    it("ошибочно присланный токен уходит только на кошелёк резерва", async () => {
      await usdt.connect(alice).transfer(sale.target, U(5));
      const before = await usdt.balanceOf(reserve.address);
      await sale.rescueToken(usdt.target, U(5));
      expect(await usdt.balanceOf(reserve.address)).to.equal(before + U(5));
    });

    it("нулевые адреса и USDT с другими знаками отклоняются", async () => {
      const Sale = await ethers.getContractFactory("IBITINFTSale");
      const a = owner.address;
      await expect(ethers.deployContract("IBITICollection", [ethers.ZeroAddress, a])).to.be.revertedWithCustomError(nft, "ZeroAddress");
      await expect(ethers.deployContract("IBITICollection", [a, ethers.ZeroAddress])).to.be.revertedWithCustomError(nft, "ZeroAddress");
      await expect(Sale.deploy(ethers.ZeroAddress, nft.target, a, a)).to.be.revertedWithCustomError(sale, "ZeroAddress");
      await expect(Sale.deploy(usdt.target, ethers.ZeroAddress, a, a)).to.be.revertedWithCustomError(sale, "ZeroAddress");
      await expect(Sale.deploy(usdt.target, nft.target, ethers.ZeroAddress, a)).to.be.revertedWithCustomError(sale, "ZeroAddress");
      await expect(Sale.deploy(usdt.target, nft.target, a, ethers.ZeroAddress)).to.be.revertedWithCustomError(sale, "ZeroAddress");
      const token = await ethers.deployContract("IBITI", [[a], [I(100_000_000)]]);
      await expect(Sale.deploy(token.target, nft.target, a, a)).to.be.revertedWithCustomError(sale, "WrongDecimals");
    });
  });

  describe("процент с перепродаж", function () {
    const ONE_K = U(1_000);

    it("5% на кошелёк резерва, включая ещё не выпущенные номера", async () => {
      const [to, amount] = await nft.royaltyInfo(9999, ONE_K);
      expect(to).to.equal(reserve.address);
      expect(amount).to.equal(U(50));
    });

    it("площадка видит стандарт: ERC-2981, ERC-721 и список NFT", async () => {
      for (const id of ["0x2a55205a", "0x80ac58cd", "0x780e9d63", "0x01ffc9a7"]) {
        expect(await nft.supportsInterface(id), id).to.equal(true);
      }
      expect(await nft.supportsInterface("0xffffffff")).to.equal(false);
    });

    it("можно менять до 10% и обнулить, выше 10% нельзя", async () => {
      await expect(nft.setRoyalty(bob.address, 1000)).to.emit(nft, "RoyaltySet").withArgs(bob.address, 1000);
      const [to, amount] = await nft.royaltyInfo(1, ONE_K);
      expect([to, amount]).to.deep.equal([bob.address, U(100)]);
      await nft.setRoyalty(reserve.address, 0);
      expect((await nft.royaltyInfo(1, ONE_K))[1]).to.equal(0n);
      await expect(nft.setRoyalty(reserve.address, 1001)).to.be.revertedWithCustomError(nft, "RoyaltyTooHigh");
      await expect(nft.setRoyalty(ethers.ZeroAddress, 500)).to.be.revertedWithCustomError(nft, "ZeroAddress");
    });

    it("передача напрямую не ограничена и ничего не удерживает", async () => {
      const id = await buy(alice, 1);
      const before = await usdt.balanceOf(reserve.address);
      await nft.connect(alice).transferFrom(alice.address, bob.address, id);
      expect(await nft.ownerOf(id)).to.equal(bob.address);
      expect(await usdt.balanceOf(reserve.address)).to.equal(before);
    });
  });

  describe("цена и выпуск навсегда", function () {
    it("цену нельзя изменить ни вверх, ни вниз, ни обнулить, в том числе списком", async () => {
      const price = await sale.priceOf(1);
      await expect(sale.setPrices([1], [price + 1n])).to.be.revertedWithCustomError(sale, "PriceLocked");
      await expect(sale.setPrices([1], [price - 1n])).to.be.revertedWithCustomError(sale, "PriceLocked");
      await expect(sale.setPrices([1], [price])).to.be.revertedWithCustomError(sale, "PriceLocked");
      await expect(sale.setPrices([1], [0])).to.be.revertedWithCustomError(sale, "PriceOutOfRange");
      await nft.addCards(["u12"], [3]);
      await expect(sale.setPrices([12, 1], [U(10), U(10)])).to.be.revertedWithCustomError(sale, "PriceLocked");
      expect(await sale.priceOf(1)).to.equal(price);
      expect(await sale.priceOf(12)).to.equal(0n);
    });

    it("цена новой карточки задаётся один раз и тоже навсегда", async () => {
      await nft.addCards(["u12"], [3]);
      await sale.setPrices([12], [U(100_000)]);
      await expect(sale.setPrices([12], [U(90_000)])).to.be.revertedWithCustomError(sale, "PriceLocked");
    });

    it("продажа назначается один раз: другую не подключить, себе карточку не выпустить", async () => {
      await expect(nft.setSeller(owner.address)).to.be.revertedWithCustomError(nft, "SellerAlreadySet");
      await expect(nft.setSeller(sale.target)).to.be.revertedWithCustomError(nft, "SellerAlreadySet");
      await expect(nft.connect(owner).mint(owner.address, 1)).to.be.revertedWithCustomError(nft, "NotSeller");
      await buy(alice, 1);
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
    });

    it("назначить можно только контракт, событие видно в сети", async () => {
      const fresh = await ethers.deployContract("IBITICollection", [owner.address, reserve.address]);
      await expect(fresh.setSeller(owner.address)).to.be.revertedWithCustomError(fresh, "NotAContract");
      await expect(fresh.setSeller(ethers.ZeroAddress)).to.be.revertedWithCustomError(fresh, "NotAContract");
      await expect(fresh.setSeller(sale.target)).to.emit(fresh, "SellerSet").withArgs(sale.target);
    });

    it("владелец не добавит больше 12 карточек", async () => {
      await expect(nft.addCards(["a", "b"], [1, 1])).to.be.revertedWithCustomError(nft, "TooManyCards");
      await nft.addCards(["a"], [1]);
      expect(await nft.cardCount()).to.equal(12n);
      await expect(nft.addCards(["b"], [1])).to.be.revertedWithCustomError(nft, "TooManyCards");
    });
  });

  describe("права владельца", function () {
    const names = (c) => [...new Set(c.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name))].sort();

    it("коллекция: записывающих функций ровно столько, новая появится только осознанно", async () => {
      expect(names(nft)).to.deep.equal([
        "acceptOwnership", "addCards", "approve", "freezeCardURI", "lowerMaxSupply", "mint", "safeTransferFrom", "setApprovalForAll",
        "setCardURI", "setRoyalty", "setSeller", "transferFrom", "transferOwnership",
      ].sort());
    });

    it("продажа: записывающих функций ровно столько", async () => {
      expect(names(sale)).to.deep.equal(["acceptOwnership", "buy", "pause", "rescueToken", "setPrices", "transferOwnership", "unpause"].sort());
    });
  });
});
