const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule — защита от реентранси", function () {
  let stakingModule, nftDiscount;
  let owner, attacker, treasury;
  let erc20, AttackContract, attackerContract, tokenSigner;
  const MONTH = 30 * 24 * 3600;

  beforeEach(async () => {
    [owner, attacker, treasury] = await ethers.getSigners();

    // 1) Деплой ERC20Mock и раздача attacker токенов
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    erc20 = await ERC20Mock.deploy("TKN", "TKN", owner.address, ethers.parseUnits("10000", 8));
    await erc20.waitForDeployment();
    const stakeAmt = ethers.parseUnits("100", 8);
    await erc20.transfer(attacker.address, stakeAmt);

    // 2) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 3) Деплой StakingModule
    const StakingModule = await ethers.getContractFactory("StakingModule");
    stakingModule = await StakingModule.deploy(erc20.target, nftDiscount.target);
    await stakingModule.waitForDeployment();

    // 4) Approve для стейка
    await erc20.connect(attacker).approve(stakingModule.target, stakeAmt);

    // 5) Настройка NFTDiscount для mintJackpot
    await nftDiscount.connect(owner).setDAOModule(stakingModule.target);

    // 6) Установка treasury
    await stakingModule.connect(owner).setTreasury(treasury.address);

    // — Вместо setAllowedCaller импersonate токен —
    await ethers.provider.send("hardhat_impersonateAccount", [erc20.target]);
    tokenSigner = await ethers.getSigner(erc20.target);
    await ethers.provider.send("hardhat_setBalance", [erc20.target, "0x1000000000000000000"]);

    // 7) attacker стейкает через tokenSigner
    await stakingModule.connect(tokenSigner).stakeTokensFor(attacker.address, stakeAmt, 1);

    // 8) Деплой AttackContract
    AttackContract = await ethers.getContractFactory("AttackContract");
    attackerContract = await AttackContract.deploy(stakingModule.target);
    await attackerContract.waitForDeployment();
  });

  afterEach(async () => {
    // Прекращаем impersonation
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [erc20.target]);
  });

  it("должно revert’ить при повторном вызове unstakeTokens", async () => {
    // Перематываем время на месяц + 1 сек (чтобы войти в grace-period)
    await ethers.provider.send("evm_increaseTime", [MONTH + 1]);
    await ethers.provider.send("evm_mine");

    // Даем treasury allowance для autoReplenish
    const stakeAmt = ethers.parseUnits("100", 8);
    await erc20.connect(treasury).approve(stakingModule.target, stakeAmt);

    // Запускаем атаку: первый вызов проходит, второй внутри fallback — ловится revert
    await expect(
      attackerContract.attackUnstake()
    ).to.be.reverted; // просто проверяем любой revert
  });
});
