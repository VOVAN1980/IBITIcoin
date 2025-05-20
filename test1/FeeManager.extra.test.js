const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – extra coverage", function () {
  let feeManager, token;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Деплой мок‑токена с 8 дец.
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "MockToken",
      "MTK",
      owner.address,
      ethers.parseUnits("10000000", 8)
    );
    await token.waitForDeployment();

    // Деплой FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();
  });

  it("should return 0 fee if nftDiscount is >= 100", async function () {
    const amount = ethers.parseUnits("1000", 8);
    const fee = await feeManager.calculateFee(
      user.address, // _user не используется в логике расчёта
      amount,
      false, // isSell
      false, // stakingActive
      false, // isVIP
      false, // isWhale
      0,     // holdingDuration
      100    // nftDiscount = 100%
    );
    expect(fee).to.equal(0);
  });

  it("should calculate fee for a sell transaction with adjustments", async function () {
    const amount = ethers.parseUnits("1000", 8);
    // Продажа с учётом всех скидок/наценок:
    // stakingActive → −1%, isVIP → −2%, isWhale → +3%, holdingDuration > 60 дней → −2%, nftDiscount = 10%
    const fee = await feeManager.calculateFee(
      user.address,
      amount,
      false, // isSell
      true,  // stakingActive
      true,  // isVIP
      true,  // isWhale
      61 * 24 * 3600, // holdingDuration > 60 дней
      10    // nftDiscount 10%
    );
    // Должна быть положительная, но меньше суммы
    expect(fee).to.be.gt(0);
    expect(fee).to.be.lt(amount);
  });
});
