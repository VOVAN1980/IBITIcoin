// Посторонний со всех сторон: каждая функция каждого контракта, BNB, функции V1, обман владельца через tx.origin.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, I, U } = require("./fixture");

const ONLY_OWNER = "Ownable: caller is not the owner";
const NOT_PENDING = "Ownable2Step: caller is not the new owner";

// Функции, которые по замыслу открыты всем. Всё остальное обязано отказать постороннему.
const OPEN = {
  token: ["transfer", "approve", "transferFrom", "increaseAllowance", "decreaseAllowance", "burn", "burnFrom"],
  vesting: [],
  promo: ["buyWithReferral"],
  staking: ["stake", "unstake", "renew", "releaseExpired"],
  nft: ["approve", "setApprovalForAll", "transferFrom", "safeTransferFrom"],
  nftSale: ["buy"],
};

// Функции V1, через которые сливали и управляли проектом
const V1_FUNCTIONS = [
  "purchaseCoinToken(address,uint256)", "purchaseCoinBNB()", "sellCoinBNB(uint256,uint256)", "sellCoinToken(address,uint256,uint256)",
  "setAcceptedPayment(address,bool)", "setCoinPriceBNB(uint256)", "setCoinPriceToken(address,uint256)", "setCoinPriceUSD(uint256)",
  "mint(address,uint256)", "bridgeMint(address,uint256)", "bridgeBurn(address,uint256)", "freezeAccount(address)", "unfreezeAccount(address)",
  "setFeeManager(address)", "setTreasury(address)", "setToken(address)", "setPayToken(address)", "setIbitiToken(address)",
  "setStakingModule(address)", "setBridgeManager(address)", "setDaoWallet(address)", "setDAOModule(address)", "switchOwnershipToDao()",
  "stakeTokensFor(address,uint256,uint256)", "unstakeTokensFor(address,uint256)", "emergencyUnstake(uint256)", "stakeTokens(uint256,uint256)", "unstakeTokens()",
  "skimExcessToTreasury(uint256)", "rescueETH(address)", "rescueERC20(address,address,uint256)", "rescueTokens(address,address,uint256)",
  "buyDiscountNFTForUSDT(uint256,string)", "buyDiscountNFTForIBI(uint256,string)", "useDiscountFor(address,uint256)", "release()", "releaseTo(address,uint256)",
  "w(address,uint256)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)", "initialize(address)", "withdraw()", "withdraw(uint256)", "sweep(address)",
];

const dummy = (type, who) => {
  if (type.endsWith("[]")) return [dummy(type.slice(0, -2), who)];
  if (type === "address") return who;
  if (type === "string") return "x";
  if (type === "bool") return true;
  if (type.startsWith("bytes")) return type === "bytes" ? "0x" : ethers.zeroPadBytes("0x", Number(type.slice(5)));
  return 1n;
};

describe("Атаки: посторонний", function () {
  let c;
  const contracts = () => ({ token: c.token, vesting: c.vesting, promo: c.promo, staking: c.staking, nft: c.nft, nftSale: c.nftSale });

  beforeEach(async () => {
    c = await deployAll();
  });

  describe("каждая функция управления закрыта", function () {
    for (const name of Object.keys(OPEN)) {
      it(`${name}: все записывающие функции вне открытого списка отказывают`, async () => {
        const contract = contracts()[name];
        const fns = contract.interface.fragments.filter((f) => f.type === "function" && !f.constant && f.stateMutability !== "view" && f.stateMutability !== "pure");
        expect(fns.length).to.be.greaterThan(0);
        for (const f of fns) {
          if (OPEN[name].includes(f.name)) continue;
          const args = f.inputs.map((i) => dummy(i.type, c.mallory.address));
          const call = contract.connect(c.mallory)[f.format("sighash")](...args);
          if (f.name === "acceptOwnership") await expect(call, f.name).to.be.revertedWith(NOT_PENDING);
          else if (f.name === "mint") await expect(call, f.name).to.be.revertedWithCustomError(contract, "NotSeller");
          else await expect(call, f.format("sighash")).to.be.revertedWith(ONLY_OWNER);
        }
      });
    }
  });

  describe("контракты не обновляются", function () {
    // Команды, которыми подменяют логику или уничтожают контракт
    const FORBIDDEN = { 0xf4: "DELEGATECALL", 0xf2: "CALLCODE", 0xff: "SELFDESTRUCT" };
    const opcodes = (hex) => {
      const code = Buffer.from(hex.slice(2), "hex");
      const end = code.length - 2 - code.readUInt16BE(code.length - 2); // хвост с хэшем исходников не код
      const seen = new Set();
      for (let i = 0; i < end; i++) {
        seen.add(code[i]);
        if (code[i] >= 0x60 && code[i] <= 0x7f) i += code[i] - 0x5f; // данные PUSH не команды
      }
      return seen;
    };

    it("ни в одном контракте нет команд подмены логики и уничтожения", async () => {
      for (const [name, contract] of Object.entries(contracts())) {
        const seen = opcodes(await ethers.provider.getCode(contract.target));
        for (const [op, label] of Object.entries(FORBIDDEN)) expect(seen.has(Number(op)), `${name}: ${label}`).to.equal(false);
      }
    });
  });

  describe("BNB", function () {
    it("ни один контракт не принимает BNB", async () => {
      for (const [name, contract] of Object.entries(contracts())) {
        await expect(c.mallory.sendTransaction({ to: contract.target, value: 1n }), name).to.be.reverted;
        await expect(c.mallory.sendTransaction({ to: contract.target, value: ethers.parseEther("10"), data: "0x12345678" }), name).to.be.reverted;
      }
    });

    it("покупка IBITI с приложенным BNB отклоняется, токены не выдаются", async () => {
      const before = await c.token.balanceOf(c.mallory.address);
      const data = c.promo.interface.encodeFunctionData("buyWithReferral", [U(10), ethers.ZeroAddress, 0]);
      await expect(c.mallory.sendTransaction({ to: c.promo.target, data, value: ethers.parseEther("1") })).to.be.reverted;
      expect(await c.token.balanceOf(c.mallory.address)).to.equal(before);
    });

    it("покупка NFT с приложенным BNB отклоняется, NFT не выдаётся", async () => {
      const data = c.nftSale.interface.encodeFunctionData("buy", [1, U(10)]);
      await expect(c.mallory.sendTransaction({ to: c.nftSale.target, data, value: ethers.parseEther("1") })).to.be.reverted;
      expect(await c.nft.balanceOf(c.mallory.address)).to.equal(0n);
    });

    it("вклад в стейкинг с приложенным BNB отклоняется", async () => {
      const data = c.staking.interface.encodeFunctionData("stake", [I(100), 3]);
      await expect(c.mallory.sendTransaction({ to: c.staking.target, data, value: ethers.parseEther("1") })).to.be.reverted;
      expect(await c.staking.totalStaked()).to.equal(0n);
    });
  });

  describe("функции V1 и случайные вызовы", function () {
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const encode = (sig, who) => {
      const types = sig.slice(sig.indexOf("(") + 1, -1).split(",").filter(Boolean);
      return ethers.id(sig).slice(0, 10) + abi.encode(types, types.map((t) => dummy(t, who))).slice(2);
    };

    it("ни одна функция V1 не срабатывает ни на одном контракте V2", async () => {
      const supply = await c.token.totalSupply();
      for (const [name, contract] of Object.entries(contracts())) {
        for (const sig of V1_FUNCTIONS) {
          // release и pause есть в V2 под другими правами: они уже проверены выше
          await expect(c.mallory.sendTransaction({ to: contract.target, data: encode(sig, c.mallory.address) }), `${name}.${sig}`).to.be.reverted;
        }
      }
      expect(await c.token.totalSupply()).to.equal(supply);
    });

    it("500 случайных вызовов ничего не меняют", async () => {
      const snapshot = async () => [await c.token.totalSupply(), await c.token.balanceOf(c.mallory.address), await c.staking.totalStaked(), await c.nft.lastTokenId(), await c.promo.soldTotal(), await c.vesting.released()];
      const before = await snapshot();
      // Простой повторяемый генератор: одинаковый набор при каждом запуске
      let seed = 0x1234567n;
      const next = () => (seed = (seed * 1103515245n + 12345n) & 0xffffffffn);
      const list = Object.values(contracts());
      const known = new Set();
      for (const contract of list) contract.interface.forEachFunction((f) => known.add(f.selector));
      for (let i = 0; i < 500; i++) {
        const sel = "0x" + next().toString(16).padStart(8, "0");
        if (known.has(sel)) continue;
        const target = list[Number(next() % BigInt(list.length))];
        await expect(c.mallory.sendTransaction({ to: target.target, data: sel + "00".repeat(64) })).to.be.reverted;
      }
      expect(await snapshot()).to.deep.equal(before);
    });
  });

  describe("обман владельца", function () {
    it("владелец нажал вредоносный контракт: tx.origin не даёт прав", async () => {
      const bot = await ethers.deployContract("AttackerBot");
      const steal = [
        [c.nft, "setSeller", [bot.target]],
        [c.nft, "setRoyalty", [bot.target, 1000]],
        [c.nft, "transferOwnership", [bot.target]],
        [c.nftSale, "setPrices", [[1], [U(1)]]],
        [c.staking, "withdrawFreeRewards", [bot.target, I(1)]],
        [c.staking, "transferOwnership", [bot.target]],
        [c.promo, "transferOwnership", [bot.target]],
      ];
      for (const [contract, fn, args] of steal) {
        const data = contract.interface.encodeFunctionData(fn, args);
        await expect(bot.connect(c.owner).exec(contract.target, data), fn).to.be.revertedWith(ONLY_OWNER);
      }
      const data = c.vesting.interface.encodeFunctionData("addMember", [bot.target]);
      await expect(bot.connect(c.vestOwner).exec(c.vesting.target, data)).to.be.revertedWith(ONLY_OWNER);
    });

    it("передача владения в один шаг невозможна: чужой адрес не становится владельцем сам", async () => {
      for (const contract of [c.nft, c.nftSale, c.staking, c.promo]) {
        await expect(contract.connect(c.mallory).acceptOwnership()).to.be.revertedWith(NOT_PENDING);
        expect(await contract.owner()).to.equal(c.owner.address);
      }
    });

    it("отказаться от владения нельзя, контракт не остаётся без хозяина", async () => {
      for (const contract of [c.nft, c.nftSale, c.staking, c.promo]) {
        await expect(contract.renounceOwnership()).to.be.revertedWithCustomError(contract, "RenounceDisabled");
      }
      await expect(c.vesting.connect(c.vestOwner).renounceOwnership()).to.be.revertedWithCustomError(c.vesting, "RenounceDisabled");
    });
  });
});
