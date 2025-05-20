const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule — extra coverage", function () {
  let staking;
  let token;
  let nftDiscount;
  let owner;
  let user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Деплой контракта NFTDiscount
    const NFTD = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTD.deploy();
    await nftDiscount.waitForDeployment();

    // Деплой тестового ERC20Mock для стейкинга
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "Mock Token",
      "MTK",
      owner.address,
      ethers.parseEther("1000")
    );
    await token.waitForDeployment();

    // Деплой StakingModule
    const Staking = await ethers.getContractFactory("StakingModule");
    staking = await Staking.deploy(token.target, nftDiscount.target);
    await staking.waitForDeployment();

    // Настройка treasury
    await staking.setTreasury(owner.address);

    // Переводим токены пользователю и даём approve
    await token.transfer(user.address, ethers.parseEther("100"));
    await token.connect(user).approve(staking.target, ethers.parseEther("100"));
  });

  describe("Admin functions", function () {
    it("only owner can set treasury", async function () {
      await expect(
        staking.connect(user).setTreasury(user.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await staking.setTreasury(user.address);
      expect(await staking.treasury()).to.equal(user.address);
    });

    it("only owner can set rewardConfig", async function () {
      await expect(
        staking.connect(user).setRewardConfig(3, 2, 5)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await staking.setRewardConfig(3, 2, 5);
      const cfg = await staking.rewardConfigs(3);
      expect(cfg.nftCount).to.equal(2);
      expect(cfg.discountPercent).to.equal(5);
    });
  });

  describe("Pause / Unpause", function () {
    it("pause blocks stake and unstake", async function () {
      // Ставим контракт на паузу
      await staking.pause();

      // Любая попытка застейкать должна откатиться
      await expect(
        staking.connect(user).stakeTokensFor(user.address, ethers.parseEther("1"), 1)
      ).to.be.revertedWith("Pausable: paused");

      // И попытка разстейкать тоже
      await expect(
        staking.connect(user).unstakeTokensFor(user.address, 0)
      ).to.be.revertedWith("Pausable: paused");

      // Снимаем паузу
      await staking.unpause();

      // Чтобы застейкать, эмулируем вызов от токена
      await ethers.provider.send("hardhat_impersonateAccount", [token.target]);
      const tokenSigner = await ethers.getSigner(token.target);
      await ethers.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

      // После unpause стейкинг проходит успешно
      await expect(
        staking.connect(tokenSigner).stakeTokensFor(user.address, ethers.parseEther("1"), 1)
      ).to.emit(staking, "Staked");

      // Останавливаем эмуляцию
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
    });
  });
});
