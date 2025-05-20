const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TeamVesting", function () {
  let vesting, token;
  let owner, beneficiary, other;
  const totalAllocation = ethers.parseUnits("1000", 18);
  const START_DELAY = 100;

  // Периоды в секундах
  const SIX_MONTHS    = 180 * 24 * 3600;
  const THREE_YEARS   = 3 * 365 * 24 * 3600;
  const LINEAR_PERIOD = 180 * 24 * 3600;

  beforeEach(async function () {
    [owner, beneficiary, other] = await ethers.getSigners();

    // Деплой мок‑токена
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("TestToken", "TT", owner.address, totalAllocation);
    await token.waitForDeployment();

    // Запоминаем текущее время и деплоим TeamVesting
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    vesting = await TeamVesting.deploy(
      totalAllocation,
      now + START_DELAY,
      beneficiary.address
    );
    await vesting.waitForDeployment();

    // Настраиваем токен и вносим всю аллокацию
    await vesting.connect(owner).setTokenAddress(token.target);
    await token.connect(owner).approve(vesting.target, totalAllocation);
    await vesting.connect(owner).depositTokens(totalAllocation);
  });

  it("reverts release when nothing is due (before start)", async function () {
    await expect(vesting.release()).to.be.revertedWith("No tokens due");
  });

  it("reverts deposit overflow", async function () {
    await expect(vesting.connect(owner).depositTokens(1))
      .to.be.revertedWith("Exceeds allocation");
  });

  it("releases 20% immediately at start", async function () {
    await ethers.provider.send("evm_increaseTime", [START_DELAY]);
    await ethers.provider.send("evm_mine", []);

    const expected20 = totalAllocation * 20n / 100n;
    expect(await vesting.releasableAmount()).to.equal(expected20);

    await expect(vesting.release())
      .to.emit(vesting, "Released")
      .withArgs(expected20);

    expect(await token.balanceOf(beneficiary.address)).to.equal(expected20);
  });

  it("releases next 30% after 6 months", async function () {
    // Первый релиз 20%
    await ethers.provider.send("evm_increaseTime", [START_DELAY]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();

    // Второй релиз 30%
    await ethers.provider.send("evm_increaseTime", [SIX_MONTHS]);
    await ethers.provider.send("evm_mine", []);

    const expected30 = totalAllocation * 30n / 100n;
    expect(await vesting.releasableAmount()).to.equal(expected30);

    await expect(vesting.release())
      .to.emit(vesting, "Released")
      .withArgs(expected30);

    const total50 = totalAllocation * 50n / 100n;
    expect(await token.balanceOf(beneficiary.address)).to.equal(total50);
  });

  it("does not release linear tranche immediately after 3‑year cliff", async function () {
    // Сначала 20%, затем 30%
    await ethers.provider.send("evm_increaseTime", [START_DELAY]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();
    await ethers.provider.send("evm_increaseTime", [SIX_MONTHS]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();

    const start    = await vesting.start();
    const cliffEnd = start + BigInt(THREE_YEARS);

    // Устанавливаем ровно конец cliff
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(cliffEnd)]);
    await ethers.provider.send("evm_mine", []);

    expect(await vesting.releasableAmount()).to.equal(0n);
  });

  it("vests 50% линейно за 180 дней и позволяет releaseTo", async function () {
    // Сначала 20%, затем 30%
    await ethers.provider.send("evm_increaseTime", [START_DELAY]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();
    await ethers.provider.send("evm_increaseTime", [SIX_MONTHS]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();

    // Рассчитываем середину линейного периода
    const start      = await vesting.start();
    const halfLinear = Math.floor(LINEAR_PERIOD / 2);
    const midLinear  = start + BigInt(THREE_YEARS) + BigInt(halfLinear);

    // Устанавливаем timestamp на середину линейного периода и майним блок
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(midLinear)]);
    await ethers.provider.send("evm_mine", []);

    // Берём фактическое releasableAmount
    const releasable = await vesting.releasableAmount();

    // Проверяем, что это около 25% (+-1%)
    const lower = totalAllocation * 24n / 100n;
    const upper = totalAllocation * 26n / 100n;
    expect(releasable).to.be.gte(lower);
    expect(releasable).to.be.lte(upper);

    // Проверяем событие: должно выпустить ровно releasable
    await expect(vesting.connect(owner).releaseTo(other.address))
      .to.emit(vesting, "Released")
      .withArgs(releasable);

    // Баланс получателя равен releasable
    expect(await token.balanceOf(other.address)).to.equal(releasable);
  });

  it("completes linear vesting и больше ничего не выдаёт", async function () {
    // 20% + 30%
    await ethers.provider.send("evm_increaseTime", [START_DELAY]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();
    await ethers.provider.send("evm_increaseTime", [SIX_MONTHS]);
    await ethers.provider.send("evm_mine", []);
    await vesting.release();

    // Рассчитываем конец линейного периода
    const start   = await vesting.start();
    const fullEnd = start + BigInt(THREE_YEARS) + BigInt(LINEAR_PERIOD);

    // Точно конец линейного периода
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(fullEnd)]);
    await ethers.provider.send("evm_mine", []);

    const remaining = await vesting.releasableAmount();
    // Около 50% (+-1%)
    expect(remaining).to.be.gte(totalAllocation * 49n / 100n);
    expect(remaining).to.be.lte(totalAllocation * 51n / 100n);

    // Проверяем выпуск остатка
    await expect(vesting.release())
      .to.emit(vesting, "Released")
      .withArgs(remaining);

    // Больше ничего не выпадает
    expect(await vesting.releasableAmount()).to.equal(0n);
  });
});
