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
    await nft.setSeller(sale.target, true);
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

    it("цена изменилась: покупка отклонена", async () => {
      const old = await sale.priceOf(1);
      await usdt.connect(alice).approve(sale.target, old);
      await sale.setPrices([1], [U(11)]);
      await expect(sale.connect(alice).buy(1, old)).to.be.revertedWithCustomError(sale, "PriceChanged");
    });

    it("цена 0: не продаётся. Без разрешения и без денег не покупается", async () => {
      await sale.setPrices([1], [0]);
      await expect(sale.connect(alice).buy(1, 0)).to.be.revertedWithCustomError(sale, "NotForSale");
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
    it("выпускает только продажа и только награды стейкинга", async () => {
      await expect(nft.connect(owner).mint(owner.address, 1)).to.be.revertedWithCustomError(nft, "NotSeller");
      await expect(nft.connect(stranger).mint(stranger.address, 1)).to.be.revertedWithCustomError(nft, "NotSeller");
      await expect(nft.connect(owner).mintJackpot(owner.address, 10, "")).to.be.revertedWithCustomError(nft, "NotJackpotMinter");
      await nft.setSeller(sale.target, false);
      await usdt.connect(alice).approve(sale.target, PRICES[0]);
      await expect(sale.connect(alice).buy(1, PRICES[0])).to.be.revertedWithCustomError(nft, "NotSeller");
    });

    it("посторонний ничем не управляет", async () => {
      const s = stranger;
      const onlyOwner = "Ownable: caller is not the owner";
      await expect(nft.connect(s).addCards(["a"], [1])).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).lowerMaxSupply(1, 1)).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).setCardURI(1, "a")).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).freezeCardURI(1)).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).setSeller(s.address, true)).to.be.revertedWith(onlyOwner);
      await expect(nft.connect(s).setJackpotMinter(s.address, true)).to.be.revertedWith(onlyOwner);
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
      await expect(nft.setSeller(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(nft, "ZeroAddress");
      await expect(nft.setJackpotMinter(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(nft, "ZeroAddress");
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

    it("одинаково для купленной и бонусной карточки", async () => {
      const bought = await buy(alice, 1);
      await nft.setJackpotMinter(stranger.address, true);
      await nft.connect(stranger).mintJackpot(alice.address, 10, "");
      const bonus = await nft.lastTokenId();
      for (const id of [bought, bonus]) {
        const [to, amount] = await nft.royaltyInfo(id, ONE_K);
        expect([to, amount]).to.deep.equal([reserve.address, U(50)]);
      }
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

  describe("бонус стейкинга", function () {
    let minter;
    const bonus = async (to = alice, level = 10) => {
      await nft.connect(minter).mintJackpot(to.address, level, "ipfs://ignored");
      return nft.lastTokenId();
    };

    beforeEach(async () => {
      minter = stranger;
      await nft.setJackpotMinter(minter.address, true);
    });

    it("уровни 3, 5, 7, 10 выдают карточки 2, 3, 4, 5 с их метаданными", async () => {
      for (const [level, cardId] of [[3, 2], [5, 3], [7, 4], [10, 5]]) {
        expect(await nft.jackpotCardOf(level)).to.equal(BigInt(cardId));
        const id = await bonus(alice, level);
        expect(await nft.ownerOf(id)).to.equal(alice.address);
        expect(await nft.cardOf(id)).to.equal(BigInt(cardId));
        expect(await nft.tokenURI(id)).to.equal(URIS[cardId - 1]);
      }
    });

    it("другие уровни отклоняются, тираж не тронут", async () => {
      for (const level of [0, 1, 2, 4, 6, 9, 11, 100]) {
        await expect(nft.connect(minter).mintJackpot(alice.address, level, "")).to.be.revertedWithCustomError(nft, "BadJackpotLevel");
      }
      expect(await nft.lastTokenId()).to.equal(0n);
    });

    it("уменьшает общий тираж: это видно в продаже", async () => {
      await bonus(alice, 3);
      await bonus(alice, 3);
      const [, minted] = await sale.catalog();
      expect(minted[1]).to.equal(2n);
      const [was] = await nft.supplyOf(2);
      await buy(bob, 2);
      const [now] = await nft.supplyOf(2);
      expect(now).to.equal(was + 1n);
    });

    it("бонус выбрал весь тираж: купить уже нельзя", async () => {
      await nft.lowerMaxSupply(5, 2);
      await bonus(alice, 10);
      await bonus(alice, 10);
      const price = await sale.priceOf(5);
      await usdt.connect(bob).approve(sale.target, price);
      await expect(sale.connect(bob).buy(5, price)).to.be.revertedWithCustomError(nft, "SoldOut");
    });

    it("покупки выбрали весь тираж: бонуса уже нет", async () => {
      await nft.lowerMaxSupply(2, 1);
      await buy(bob, 2);
      await expect(nft.connect(minter).mintJackpot(alice.address, 3, "")).to.be.revertedWithCustomError(nft, "SoldOut");
    });

    it("можно передать и продать, как купленную карточку", async () => {
      const id = await bonus(alice, 10);
      await nft.connect(alice).transferFrom(alice.address, bob.address, id);
      expect(await nft.ownerOf(id)).to.equal(bob.address);
      await nft.connect(bob).approve(stranger.address, id);
      await nft.connect(stranger).transferFrom(bob.address, alice.address, id);
      expect(await nft.ownerOf(id)).to.equal(alice.address);
      const [minted] = await nft.supplyOf(5);
      expect(minted).to.equal(1n);
    });

    it("список NFT кошелька показывает и купленные, и бонусные", async () => {
      const a = await buy(alice, 2);
      const b = await bonus(alice, 3);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 0)).to.equal(a);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 1)).to.equal(b);
    });
  });

  describe("связка с настоящим стейкингом", function () {
    let token, staking;

    const matured = async (months, idx = 0) => {
      await staking.connect(alice).stake(I(1_000), months);
      await nextTxAt(await staking.maturityOf(alice.address, idx));
    };

    beforeEach(async () => {
      token = await ethers.deployContract("IBITI", [[owner.address], [I(100_000_000)]]);
      staking = await ethers.deployContract("IBITIStaking", [token.target, owner.address, I(100)]);
      await token.transfer(staking.target, I(1_000_000));
      await staking.unpause();
      await token.transfer(alice.address, I(100_000));
      await token.connect(alice).approve(staking.target, ethers.MaxUint256);
    });

    it("вклад на каждый срок даёт 2 свои карточки, тираж уменьшается, их можно продать", async () => {
      await staking.setNFT(nft.target);
      await nft.setJackpotMinter(staking.target, true);
      const want = [[3, 3n, 2], [6, 5n, 3], [9, 7n, 4], [12, 10n, 5]];
      for (const [idx, [months, level, cardId]] of want.entries()) {
        await matured(months, idx);
        const before = await nft.balanceOf(alice.address);
        await expect(staking.connect(alice).unstake(idx)).to.emit(staking, "NFTRewardMinted").withArgs(alice.address, level);
        expect(await nft.balanceOf(alice.address)).to.equal(before + 2n);
        const id = await nft.lastTokenId();
        expect(await nft.cardOf(id)).to.equal(BigInt(cardId));
        expect(await nft.tokenURI(id)).to.equal(URIS[cardId - 1]);
        const [minted] = await nft.supplyOf(cardId);
        expect(minted).to.equal(2n);
        await nft.connect(alice).transferFrom(alice.address, bob.address, id);
        expect(await nft.ownerOf(id)).to.equal(bob.address);
      }
    });

    it("продление в окне тоже даёт карточки", async () => {
      await staking.setNFT(nft.target);
      await nft.setJackpotMinter(staking.target, true);
      await matured(6);
      await staking.connect(alice).renew(0, I(1_000), 3);
      const [minted] = await nft.supplyOf(3);
      expect(minted).to.equal(2n);
      expect(await nft.balanceOf(alice.address)).to.equal(2n);
    });

    it("остался 1 из 2: одна карточка выдана, вторая пропущена, токены выплачены", async () => {
      await staking.setNFT(nft.target);
      await nft.setJackpotMinter(staking.target, true);
      await nft.lowerMaxSupply(2, 1);
      await matured(3);
      const before = await token.balanceOf(alice.address);
      const tx = staking.connect(alice).unstake(0);
      await expect(tx).to.emit(staking, "NFTRewardMinted").withArgs(alice.address, 3n);
      await expect(tx).to.emit(staking, "NFTRewardSkipped").withArgs(alice.address, 3n);
      expect(await token.balanceOf(alice.address)).to.equal(before + I(1_050));
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
    });

    it("тираж распродан: токены выплачены, NFT нет", async () => {
      await staking.setNFT(nft.target);
      await nft.setJackpotMinter(staking.target, true);
      await nft.lowerMaxSupply(2, 1);
      await buy(bob, 2);
      await matured(3);
      const before = await token.balanceOf(alice.address);
      await expect(staking.connect(alice).unstake(0)).to.emit(staking, "NFTRewardSkipped");
      expect(await token.balanceOf(alice.address)).to.equal(before + I(1_050));
      expect(await nft.balanceOf(alice.address)).to.equal(0n);
    });

    it("нет роли у стейкинга: токены выплачены, NFT пропущен", async () => {
      await staking.setNFT(nft.target);
      await matured(3);
      const before = await token.balanceOf(alice.address);
      await expect(staking.connect(alice).unstake(0)).to.emit(staking, "NFTRewardSkipped");
      expect(await token.balanceOf(alice.address)).to.be.gt(before);
      expect(await nft.balanceOf(alice.address)).to.equal(0n);
    });
  });
});
