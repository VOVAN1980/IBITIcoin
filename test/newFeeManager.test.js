// test/FeeManager.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager Tests", function () {
  let feeManager, token;
  let owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Деплой мок‑токена
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "FeeToken", 
      "FTKN", 
      owner.address, 
      ethers.parseUnits("1000000", 8)
    );
    await token.waitForDeployment();

    // Деплой FeeManager
    const FeeManagerFactory = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerFactory.deploy(token.target);
    await feeManager.waitForDeployment();
  });

  it("should update user activity via token contract", async function () {
    // 1) Фандим impersonated account для оплаты газа
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [token.target, "0x1000000000000000000"] // 1 ETH
    });

    // 2) Имперсонейшн
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [token.target]
    });
    const tokenSigner = await ethers.getSigner(token.target);

    // 3) Вызов updateActivity
    await expect(
      feeManager.connect(tokenSigner).updateActivity(addr1.address, ethers.parseUnits("1000", 8), true)
    ).to.emit(feeManager, "ActivityUpdated");

    // 4) Останов impersonation
    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [token.target]
    });
  });

  it("should set volatility tiers and adjust volatility coefficient", async function () {
    // 1) Задаём пороги и значения волатильности
    const tiers = [
      { volumeThreshold: ethers.parseUnits("1000", 8), volatilityValue: 120 },
      { volumeThreshold: ethers.parseUnits("5000", 8), volatilityValue: 150 }
    ];
    await feeManager.setVolatilityTiers(tiers);

    // 2) Симулируем активность пользователя выше первого порога
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [token.target, "0x1000000000000000000"]
    });
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [token.target]
    });
    const tokenSigner = await ethers.getSigner(token.target);
    await feeManager.connect(tokenSigner).updateActivity(addr1.address, ethers.parseUnits("2000", 8), true);
    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [token.target]
    });

    // 3) Применяем параметры и проверяем коэффициент
    await feeManager.auditParameters();
    const coeff = await feeManager.volatilityCoefficient();
    expect(coeff).to.be.gt(0);
  });
});
