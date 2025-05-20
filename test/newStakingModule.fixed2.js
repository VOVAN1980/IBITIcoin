const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("New StakingModule Tests", function () {
  let token, nftDiscount, stakingModule, tokenSigner;
  let owner, user;
  const initialSupply = ethers.parseUnits("1000000", 8); // 1 000 000 токенов с 8 десятичными

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // 1) Деплой ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("IBITIcoin", "IBITI", owner.address, initialSupply);
    await token.waitForDeployment();

    // 2) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 3) Деплой StakingModule
    const StakingModule = await ethers.getContractFactory("StakingModule");
    stakingModule = await StakingModule.deploy(token.target, nftDiscount.target);
    await stakingModule.waitForDeployment();

    // 4) Устанавливаем казну (нужна для тестов unstake с вознаграждением)
    await stakingModule.connect(owner).setTreasury(owner.address);

    // 5) Раздаём пользователю токены и даём approve
    const userTokens = ethers.parseUnits("10000", 8);
    await token.transfer(user.address, userTokens);
    await token.connect(user).approve(stakingModule.target, userTokens);

    // 6) Эмулируем вызовы от контракта токена
    await ethers.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Даем токен-синнеру эфир для газа
    await ethers.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);
  });

  afterEach(async function () {
    // Прекращаем эмуляцию
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  it("should allow user to stake tokens and then unstake with reward (on-time)", async function () {
    const stakeAmt = ethers.parseUnits("1000", 8);
    const duration = 1; // 1 месяц

    // Стейк от имени токена
    await expect(
      stakingModule.connect(tokenSigner).stakeTokensFor(user.address, stakeAmt, duration)
    )
      .to.emit(stakingModule, "Staked")
      .withArgs(user.address, stakeAmt, duration);

    // Прокручиваем время на 30 дней
    const secondsPerMonth = 30 * 24 * 3600;
    await ethers.provider.send("evm_increaseTime", [secondsPerMonth]);
    await ethers.provider.send("evm_mine", []);

    // Дозаливаем reward, если не хватает
    const reward = stakeAmt * 1n / 100n; // 1%
    const payout = stakeAmt + reward;
    const curBal = await token.balanceOf(stakingModule.target);
    if (curBal < payout) {
      await token.transfer(stakingModule.target, payout - curBal);
    }

    // Анстейк от имени токена
    await expect(
      stakingModule.connect(tokenSigner).unstakeTokensFor(user.address, 0)
    )
      .to.emit(stakingModule, "Unstaked")
      .withArgs(user.address, stakeAmt, reward, 0, 0, false);

    // Проверяем, что баланс юзера вырос
    const finalBal = await token.balanceOf(user.address);
    expect(finalBal).to.be.gt(ethers.parseUnits("10000", 8));
  });

  it("should apply penalty on early unstake", async function () {
    const stakeAmt = ethers.parseUnits("1000", 8);
    const duration = 3; // 3 месяца

    // Стейк
    await stakingModule.connect(tokenSigner).stakeTokensFor(user.address, stakeAmt, duration);

    // Прокрутка только на 30 дней (ранний unstake)
    const thirtyDays = 30 * 24 * 3600;
    await ethers.provider.send("evm_increaseTime", [thirtyDays]);
    await ethers.provider.send("evm_mine", []);

    // Дозаливаем токены в казну на выплату (штраф уйдет туда же)
    await token.transfer(stakingModule.target, stakeAmt);

    // Расчет штрафа (предположительно 5%)
    const penalty = stakeAmt * 5n / 100n;
    const expectedPayout = stakeAmt - penalty;

    const balBefore = await token.balanceOf(user.address);
    await expect(
      stakingModule.connect(tokenSigner).unstakeTokensFor(user.address, 0)
    )
      .to.emit(stakingModule, "Unstaked")
      .withArgs(user.address, stakeAmt, 0, penalty, 0, false);
    const balAfter = await token.balanceOf(user.address);
    expect(balAfter - balBefore).to.equal(expectedPayout);
  });

  it("should revert unstake if treasury is not set", async function () {
    // Новый экземпляр без setTreasury
    const StakingModule = await ethers.getContractFactory("StakingModule");
    const fresh = await StakingModule.deploy(token.target, nftDiscount.target);
    await fresh.waitForDeployment();

    // Раздадим и одобрим токены
    const userTokens = ethers.parseUnits("5000", 8);
    await token.transfer(user.address, userTokens);
    await token.connect(user).approve(fresh.target, userTokens);

    // Стейк от имени токена
    const stakeAmt = ethers.parseUnits("1000", 8);
    await fresh.connect(tokenSigner).stakeTokensFor(user.address, stakeAmt, 1);

    // Ждём месяц
    const secondsPerMonth = 30 * 24 * 3600;
    await ethers.provider.send("evm_increaseTime", [secondsPerMonth]);
    await ethers.provider.send("evm_mine", []);

    // Должно провалиться, тк treasury == address(0)
    await expect(
      fresh.connect(tokenSigner).unstakeTokensFor(user.address, 0)
    ).to.be.revertedWith("Treasury not set");
  });
});
