const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("FeeManager – Volatility Tiers & updateActivity", function() {
  let feeManager, tokenContract;
  let owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Деплой ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    tokenContract = await ERC20Mock.deploy(
      "TK", "TK", owner.address, ethers.parseUnits("1000", 8)
    );
    await tokenContract.waitForDeployment();

    // Деплой FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(tokenContract.target);
    await feeManager.waitForDeployment();
  });

  it("only owner can set volatility tiers and auditParameters applies tier logic", async () => {
    // Настройка двух tiers
    const tiers = [
      { volumeThreshold: ethers.parseUnits("100", 8), volatilityValue: 120 },
      { volumeThreshold: ethers.parseUnits("200", 8), volatilityValue: 150 }
    ];
    await expect(feeManager.connect(owner).setVolatilityTiers(tiers))
      .to.emit(feeManager, "VolatilityTiersUpdated");

    // Проверяем default
    const defaultCoef = await feeManager.defaultVolatilityCoefficient();
    await expect(feeManager.connect(owner).auditParameters())
      .to.emit(feeManager, "VolatilityCoefficientUpdated")
      .withArgs(defaultCoef);
    expect(await feeManager.volatilityCoefficient()).to.equal(defaultCoef);

    // Эмулируем объем ≥200
    const vol = ethers.parseUnits("300", 8);
    await tokenContract.connect(owner).transfer(alice.address, vol);

    // Impersonate tokenContract
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [tokenContract.target]
    });
    // Даем ETH имперсону для газа
    await network.provider.send("hardhat_setBalance", [
      tokenContract.target,
      "0x1000000000000000000" // 1 ETH
    ]);
    const tokenSigner = await ethers.getSigner(tokenContract.target);

    // Вызов updateActivity
    await expect(
      feeManager.connect(tokenSigner).updateActivity(alice.address, vol, false)
    ).to.emit(feeManager, "ActivityUpdated");

    // Прекращаем impersonation
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [tokenContract.target]
    });

    // Теперь коэффициент должен стать 150
    await expect(feeManager.connect(owner).auditParameters())
      .to.emit(feeManager, "VolatilityCoefficientUpdated")
      .withArgs(150);
    expect(await feeManager.volatilityCoefficient()).to.equal(150);

    // Alias
    await expect(feeManager.connect(owner).autoAdjustVolatilityCoefficient())
      .to.emit(feeManager, "VolatilityCoefficientUpdated");
  });

  it("updateActivity reverts if caller is not tokenContract", async () => {
    await expect(
      feeManager.connect(bob).updateActivity(alice.address, 1, true)
    ).to.be.revertedWith("Only token contract");
  });
});
