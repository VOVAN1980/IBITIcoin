// test/TeamVesting.test.js
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/* ────────────── константы ────────────── */
const ONE_DAY       = 24 * 60 * 60;
const SIX_MONTHS    = 180 * ONE_DAY;         // 15 552 000
const THREE_YEARS   = 3 * 365 * ONE_DAY;     // 94 608 000
const LINEAR_PERIOD = SIX_MONTHS;            // 180 дней
const HALF_LINEAR   = LINEAR_PERIOD / 2;     // 90 дней

/** Автомайн блока после прыжка времени */
async function jump(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("TeamVesting", function () {
  let token, vesting;
  let owner, beneficiary, other;
  let TOTAL, START;

  beforeEach(async () => {
    [owner, beneficiary, other] = await ethers.getSigners();

    // 1) Деплой ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TKN",
      "TKN",
      owner.address,
      ethers.parseUnits("1000", 18)
    );
    await token.waitForDeployment();
    TOTAL = await token.totalSupply();

    // 2) Рассчитываем старт вестинга = now + 10 с
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    START = now + 10;

    // 3) Деплой TeamVesting
    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    vesting = await TeamVesting.deploy(TOTAL, START, beneficiary.address);
    await vesting.waitForDeployment();

    // 4) Настраиваем токен и депонируем всю аллокацию
    await vesting.setTokenAddress(token.target);
    await token.approve(vesting.target, TOTAL);
    await vesting.depositTokens(TOTAL);
  });

  it("reverts depositTokens if exceeds allocation", async () => {
    await token.approve(vesting.target, TOTAL);
    await expect(
      vesting.depositTokens(1n)
    ).to.be.revertedWith("Exceeds allocation");
  });

  it("releasableAmount == 0 before start", async () => {
    expect(await vesting.releasableAmount()).to.equal(0n);
  });

  it("releases 20 % immediately at start", async () => {
    // прыжок ко времени START
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);

    const vested20 = (TOTAL * 20n) / 100n;
    // проверяем view
    expect(await vesting.releasableAmount()).to.equal(vested20);

    // release() эмиттит и переводит
    await expect(vesting.connect(beneficiary).release())
      .to.emit(vesting, "Released")
      .withArgs(vested20);

    expect(await token.balanceOf(beneficiary.address)).to.equal(vested20);
  });

  it("after 6 months vested = 50 %", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(SIX_MONTHS);

    const vested50 = (TOTAL * 50n) / 100n;
    expect(await vesting.releasableAmount()).to.equal(vested50);
  });

  it("linear vesting between 3 y and 3 y + 6 m", async () => {
    // к START
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    // клифф 3 года
    await jump(THREE_YEARS);

    const afterCliff = (TOTAL * 50n) / 100n;
    expect(await vesting.releasableAmount()).to.equal(afterCliff);

    // +90 дней (половина линейного периода)
    await jump(HALF_LINEAR);

    // ожидаем +25 % от TOTAL
    const expected = afterCliff + (TOTAL * 50n) / 100n / 2n;
    const actual   = await vesting.releasableAmount();

    // допускаем погрешность в 1 секунду линейного начисления
    const perSec = (TOTAL * 50n) / 100n / BigInt(LINEAR_PERIOD);
    expect(actual).to.be.closeTo(expected, perSec);
  });

  it("full vesting after cliff + full linear", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    // 3 года + 6 мес + 1 с запас
    await jump(THREE_YEARS + LINEAR_PERIOD + 1);
    expect(await vesting.releasableAmount()).to.equal(TOTAL);
  });

  it("releaseTo sends vested tokens to another address", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(SIX_MONTHS);

    const vested50 = (TOTAL * 50n) / 100n;
    await expect(vesting.connect(owner).releaseTo(other.address))
      .to.emit(vesting, "Released")
      .withArgs(vested50);

    expect(await token.balanceOf(other.address)).to.equal(vested50);
  });

  it("getVestingInfo returns correct tuple after 6 m", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(SIX_MONTHS);

    const vested50 = (TOTAL * 50n) / 100n;
    const [totalVested, locked, pending] = await vesting.getVestingInfo();

    expect(totalVested).to.equal(vested50);
    expect(locked).to.equal(TOTAL - vested50);
    expect(pending).to.equal(vested50);
  });

  it("reverts release when nothing due", async () => {
    // к START
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);

    // первый релиз (20 %)
    await vesting.connect(beneficiary).release();

    // второй релиз — должно revert с "No tokens due"
    await expect(
      vesting.connect(beneficiary).release()
    ).to.be.revertedWith("No tokens due");  // :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}
  });
});
