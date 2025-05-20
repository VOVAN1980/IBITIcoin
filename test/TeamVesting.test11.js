// test/TeamVesting.test.js
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/* ────────────── константы ────────────── */
const ONE_DAY       = 24 * 60 * 60;
const SIX_MONTHS    = 180 * ONE_DAY;         // 15 552 000
const THREE_YEARS   = 3 * 365 * ONE_DAY;     // 94 608 000
const LINEAR_PERIOD = SIX_MONTHS;            // 180 дней
const HALF_LINEAR   = LINEAR_PERIOD / 2;     // 90 дней

/** Автоматический майн нового блока после прыжка времени */
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

    // 2) Старт вестинга через +10 секунд от now
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    START = now + 10;

    // 3) Деплой TeamVesting
    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    vesting = await TeamVesting.deploy(TOTAL, START, beneficiary.address);
    await vesting.waitForDeployment();

    // 4) Настройка токена и депозит аллокации
    await vesting.setTokenAddress(token.target);
    await token.approve(vesting.target, TOTAL);
    await vesting.depositTokens(TOTAL);
  });

  it("reverts depositTokens if exceeds allocation", async () => {
    await token.approve(vesting.target, TOTAL);
    await expect(vesting.depositTokens(1n)).to.be.revertedWith("Exceeds allocation");
  });

  it("releasableAmount == 0 before start", async () => {
    expect(await vesting.releasableAmount()).to.equal(0n);
  });

  it("releases 20% immediately at start", async () => {
    // к моменту START
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);

    const vested20 = (TOTAL * 20n) / 100n;
    expect(await vesting.releasableAmount()).to.equal(vested20);

    await expect(vesting.connect(beneficiary).release())
      .to.emit(vesting, "Released")
      .withArgs(vested20);

    expect(await token.balanceOf(beneficiary.address)).to.equal(vested20);
  });

  it("after 6 months vested = 50%", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(SIX_MONTHS);

    const vested50 = (TOTAL * 50n) / 100n;
    expect(await vesting.releasableAmount()).to.equal(vested50);
  });

  it("linear vesting between 3y and 3y + 6m", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(THREE_YEARS);

    const afterCliff = (TOTAL * 50n) / 100n;
    expect(await vesting.releasableAmount()).to.equal(afterCliff);

    await jump(HALF_LINEAR);

    const expected = afterCliff + (TOTAL * 50n) / 100n / 2n;
    const actual = await vesting.releasableAmount();
    const perSec = (TOTAL * 50n) / 100n / BigInt(LINEAR_PERIOD);
    expect(actual).to.be.closeTo(expected, perSec);
  });

  it("full vesting after cliff + linear", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(THREE_YEARS + LINEAR_PERIOD + 1);

    expect(await vesting.releasableAmount()).to.equal(TOTAL);
  });

  it("releaseTo sends vested tokens to other address", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(SIX_MONTHS);

    const vested50 = (TOTAL * 50n) / 100n;
    await expect(vesting.connect(owner).releaseTo(other.address))
      .to.emit(vesting, "Released")
      .withArgs(vested50);

    expect(await token.balanceOf(other.address)).to.equal(vested50);
  });

  it("getVestingInfo returns correct tuple after 6m", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await jump(SIX_MONTHS);

    const vested50 = (TOTAL * 50n) / 100n;
    const [totalVested, locked, pending] = await vesting.getVestingInfo();

    expect(totalVested).to.equal(vested50);
    expect(locked).to.equal(TOTAL - vested50);
    expect(pending).to.equal(vested50);
  });

  it("reverts release when nothing due", async () => {
    await jump(START - (await ethers.provider.getBlock("latest")).timestamp);
    await vesting.connect(beneficiary).release();
    await expect(vesting.connect(beneficiary).release()).to.be.revertedWith("No tokens due");
  });

  // Новые тесты для setBeneficiary и constructor
  it("constructor reverts on zero allocation", async () => {
    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    await expect(TeamVesting.deploy(0, START, beneficiary.address))
      .to.be.revertedWith("Allocation zero");
  });

  it("constructor reverts on zero beneficiary", async () => {
    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    await expect(TeamVesting.deploy(TOTAL, START, ethers.ZeroAddress))
      .to.be.revertedWith("Beneficiary zero");
  });

  it("setBeneficiary reverts on zero address", async () => {
    await expect(vesting.setBeneficiary(ethers.ZeroAddress))
      .to.be.revertedWith("Beneficiary zero");
  });

  it("setBeneficiary emits event and updates state", async () => {
    await expect(vesting.setBeneficiary(other.address))
      .to.emit(vesting, "BeneficiaryUpdated")
      .withArgs(other.address);
    expect(await vesting.beneficiary()).to.equal(other.address);
  });
});
