const { expect } = require("chai");
const { ethers } = require("hardhat");

// Каждая дыра V1 должна быть невозможна в V2.
// Проверка через «белый список»: любая новая функция в контракте уронит этот тест,
// и её придётся осознанно добавить сюда после ревью.

const E = (n) => ethers.parseUnits(String(n), 8);
const TOTAL = E(100_000_000);

const functionNames = (contract) =>
  [...new Set(contract.interface.fragments.filter((f) => f.type === "function").map((f) => f.name))].sort();

describe("Регрессия V1 → V2: дыры V1 невозможны", function () {
  let token, vesting, reserve, attacker;

  beforeEach(async () => {
    [reserve, attacker] = await ethers.getSigners();
    token = await ethers.deployContract("IBITI", [[reserve.address], [TOTAL]]);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    vesting = await ethers.deployContract("IBITIVesting", [token.target, reserve.address, E(10_000_000), now]);
  });

  it("токен: только стандарт ERC20 + сжигание своих — никаких прав владельца", async () => {
    expect(functionNames(token)).to.deep.equal(
      [
        "TOTAL_SUPPLY", "allowance", "approve", "balanceOf", "burn", "burnFrom", "decimals",
        "decreaseAllowance", "increaseAllowance", "name", "symbol", "totalSupply", "transfer", "transferFrom",
      ].sort()
    );
  });

  it("токен: нет ни одной функции из V1, которые видят сканеры", async () => {
    const v1Danger = [
      "owner", "transferOwnership", "renounceOwnership",                 // Ownership Not Renounced
      "mint", "bridgeMint",                                               // Is Mintable
      "bridgeBurn", "treasurySend",                                       // Can Modify Balance
      "pause", "unpause",                                                 // Is Transfer Pausable
      "freezeAccount", "unfreezeAccount", "flagBot",                      // Has Blacklist
      "setFlags", "setFeeManager", "setFeeDisabled", "setBurnPercentage", // Modifiable tax
      "purchaseCoinToken", "purchaseCoinBNB", "sellCoinToken", "sellCoinBNB",
      "setCoinPriceToken", "setAcceptedPayment",                          // слив V1
      "upgradeTo", "upgradeToAndCall",                                    // Upgradeable
      "rescueERC20", "rescueETH", "w",
    ];
    expect(functionNames(token).filter((n) => v1Danger.includes(n))).to.deep.equal([]);
  });

  it("слив V1: снять токены с чужого кошелька без approve невозможно", async () => {
    await expect(token.connect(attacker).transferFrom(reserve.address, attacker.address, E(1_300_000)))
      .to.be.revertedWith("ERC20: insufficient allowance");
    await expect(token.connect(attacker).burnFrom(reserve.address, 1n))
      .to.be.revertedWith("ERC20: insufficient allowance");
    expect(await token.balanceOf(reserve.address)).to.equal(TOTAL);
  });

  it("покупки за BNB/USDT внутри токена нет: BNB на токен отправить нельзя", async () => {
    await expect(attacker.sendTransaction({ to: token.target, value: ethers.parseEther("0.01") })).to.be.reverted;
    await expect(attacker.sendTransaction({ to: token.target, data: "0x12345678" })).to.be.reverted;
  });

  it("выпуск зафиксирован: больше 100 000 000 не станет никогда", async () => {
    expect(await token.totalSupply()).to.equal(TOTAL);
    expect(await ethers.provider.getCode(token.target)).to.not.equal("0x");
    // в коде нет mint ни в каком виде — только конструктор (см. тест белого списка)
  });

  it("вестинг: нет смены токена и графика, releaseTo и rescue (дыры TeamVesting V1)", async () => {
    expect(functionNames(vesting)).to.deep.equal(
      [
        "FINAL_CLIFF", "FINAL_DURATION", "SECOND_TRANCHE_DELAY",
        "acceptOwnership", "addMember", "available", "isMember", "owner", "pendingOwner", "release", "released",
        "removeMember", "renounceOwnership", "start", "token", "totalAllocation", "transferOwnership", "unlockedAt",
      ].sort()
    );
  });
});
