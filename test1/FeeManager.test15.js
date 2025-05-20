const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager — calculateFee branch coverage", function () {
  let owner, feeManager, mockToken;

  // Нулевой адрес
  const ZERO = "0x0000000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // Деплой mock токена
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    mockToken = await ERC20Mock.deploy(
      "MockToken",
      "MTK",
      owner.address,
      1_000_000
    );
    await mockToken.waitForDeployment();
    // Получаем адрес mock токена
    const mockTokenAddress = await mockToken.getAddress();

    // Деплой FeeManager с использованием корректного адреса токена
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(mockTokenAddress);
    await feeManager.waitForDeployment();
  });

  it("clamps to minFee when rawFee < minFee", async function () {
    await feeManager.setMinFee(5);
    const fee = await feeManager.calculateFee(
      ZERO,
      1,
      false,  // isBuy=false → продажа
      false,  // stakingActive
      false,  // isVIP
      false,  // isWhale
      0,      // holdingDuration
      0       // nftDiscount
    );
    expect(fee).to.equal(5);
  });

  it("clamps to maxFee when rawFee > maxFee", async function () {
    await feeManager.setMaxFee(10);
    const fee = await feeManager.calculateFee(
      ZERO,
      20000,
      false,
      false,
      false,
      false,
      0,
      0
    );
    expect(fee).to.equal(10);
  });

  it("does not clamp when rawFee within [minFee, maxFee]", async function () {
    await feeManager.setMinFee(0);
    await feeManager.setMaxFee(1000000);
    const fee = await feeManager.calculateFee(
      ZERO,
      2000,
      false,
      false,
      false,
      false,
      0,
      0
    );
    expect(fee).to.equal(200);
  });

  it("returns zero fee when nftDiscount ≥ 100", async function () {
    const fee = await feeManager.calculateFee(
      ZERO,
      1000,
      false,
      false,
      false,
      false,
      0,
      100
    );
    expect(fee).to.equal(0);
  });
});
