// test/FeeManager.extra.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – Volatility Tiers & auditParameters", function() {
  let feeManager, token, owner, other;

  beforeEach(async function() {
    [owner, other] = await ethers.getSigners();

    // Деплой мок-токена для FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "Mock Token",
      "MTK",
      owner.address,
      ethers.parseEther("1000")
    ); // :contentReference[oaicite:0]{index=0}

    // Деплой FeeManager с адресом токена
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target); // :contentReference[oaicite:1]{index=1}
  });

  it("should revert setVolatilityTiers if called by non-owner", async function() {
    const tiers = [{ volumeThreshold: 0, volatilityValue: 150 }];
    await expect(
      feeManager.connect(other).setVolatilityTiers(tiers)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner can set volatility tiers and emits VolatilityTiersUpdated", async function() {
    const tiers = [{ volumeThreshold: 0, volatilityValue: 150 }];
    const tx = await feeManager.setVolatilityTiers(tiers);
    await expect(tx).to.emit(feeManager, "VolatilityTiersUpdated"); // :contentReference[oaicite:2]{index=2}

    // Проверяем, что структура сохранилась
    const t0 = await feeManager.volatilityTiers(0);
    expect(t0.volumeThreshold).to.equal(0);
    expect(t0.volatilityValue).to.equal(150);
  });

  it("auditParameters applies tier logic and emits VolatilityCoefficientUpdated", async function() {
    const tiers = [{ volumeThreshold: 0, volatilityValue: 300 }];
    await feeManager.setVolatilityTiers(tiers);

    await expect(feeManager.auditParameters())
      .to.emit(feeManager, "VolatilityCoefficientUpdated")
      .withArgs(300);

    expect(await feeManager.volatilityCoefficient()).to.equal(300);
  });

  it("autoAdjustVolatilityCoefficient alias works the same", async function() {
    const tiers = [{ volumeThreshold: 0, volatilityValue: 400 }];
    await feeManager.setVolatilityTiers(tiers);

    await expect(feeManager.autoAdjustVolatilityCoefficient())
      .to.emit(feeManager, "VolatilityCoefficientUpdated")
      .withArgs(400);

    expect(await feeManager.volatilityCoefficient()).to.equal(400);
  });
});
