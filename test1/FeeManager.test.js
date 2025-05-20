const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager", function() {
  let feeManager;
  let owner, user;
  let ERC20Mock, token;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // Деплой тестового ERC20, чтобы узнать decimals()
    ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("Test", "TST", owner.address, ethers.parseEther("1000"));
    await token.waitForDeployment();

    // Деплой FeeManager с tokenContract = адрес нашего ERC20Mock
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();
  });

  it("constructor sets tokenContract and tokenDecimals", async () => {
    expect(await feeManager.tokenContract()).to.equal(token.target);
    expect(await feeManager.tokenDecimals()).to.equal(await token.decimals());
  });

  it("setTokenContract: onlyOwner & invalid address", async () => {
    // Только владелец
    await expect(
      feeManager.connect(user).setTokenContract(user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    // Невалидный адрес
    await expect(
  feeManager.setTokenContract(ethers.ZeroAddress)
).to.be.revertedWith("FM: zero tokenContract");
    // Успешно меняем
    await feeManager.setTokenContract(user.address);
    expect(await feeManager.tokenContract()).to.equal(user.address);
  });

  it("setVolatilityParams + auditParameters (old logic)", async () => {
    await feeManager.setVolatilityParams(
      1000,  // highVolThreshold
      100,   // lowVolThreshold
      200,   // highVolValue
      10,    // lowVolValue
      50     // defaultVol
    );
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(10);
  });

  it("calculateFee: buy vs sell и различные флаги", async () => {
    // По новой логике baseBuyFee=0, baseSellFee=10, volatilityCoefficient=100

    // Покупка: fee = 0
    let fee = await feeManager.calculateFee(
      user.address, 10000, /*isBuy=*/ true,
      false, false, false,
      0, 0
    );
    expect(fee).to.equal(0);

    // Продажа без скидок: 10% от суммы
    fee = await feeManager.calculateFee(
      user.address, 10000, /*isBuy=*/ false,
      false, false, false,
      0, 0
    );
    expect(fee).to.equal(1000);

    // Продажа с VIP (–2%): 8%
    fee = await feeManager.calculateFee(
      user.address, 10000, false,
      false, /*isVIP=*/ true, false,
      0, 0
    );
    expect(fee).to.equal(800);

    // Продажа с whale (+3%): 13%
    fee = await feeManager.calculateFee(
      user.address, 10000, false,
      false, false, /*isWhale=*/ true,
      0, 0
    );
    expect(fee).to.equal(1300);
  });
});
