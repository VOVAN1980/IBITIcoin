const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – допветви calculateFee & setters", function() {
  let owner, feeManager, erc20;

  before(async () => {
    [owner] = await ethers.getSigners();

    // 1) Разворачиваем ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    erc20 = await ERC20Mock.deploy(
      "Mock", "MCK",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await erc20.waitForDeployment();

    // 2) FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(erc20.target);
    await feeManager.waitForDeployment();
  });

  it("setBaseSellFee эмитит FeeParametersUpdated и обновляет baseSellFee", async function() {
    const buy = await feeManager.baseBuyFee();
    const min = await feeManager.minFee();
    const max = await feeManager.maxFee();
    const decay = await feeManager.timeDecay();

    await expect(feeManager.connect(owner).setBaseSellFee(42))
      .to.emit(feeManager, "FeeParametersUpdated").withArgs(
        buy, 42n, min, max, decay
      );
    expect(await feeManager.baseSellFee()).to.equal(42n);
  });

  it("calculateFee для покупки возвращает amount * baseBuyFee / 100", async function() {
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(
      owner.address, amount,
      true,  // isBuy
      false, // stakingActive
      false, // isVIP
      false, // isWhale
      0,     // holdingDuration
      0      // nftDiscount
    );
    const baseBuy = await feeManager.baseBuyFee(); // BigInt
    const expected = amount * baseBuy / 100n;
    expect(fee).to.equal(expected);
  });

  it("calculateFee для продажи учитывает стейкинг, VIP, whale и длительность холда", async function() {
    const amount = ethers.parseUnits("100", 8);

    // default sale
    let fee = await feeManager.calculateFee(owner.address, amount, false, false, false, false, 0, 0);
    const baseSell = await feeManager.baseSellFee();
    expect(fee).to.equal(amount * baseSell / 100n);

    // stakingActive (staking discount: 90% of baseSellFee)
    fee = await feeManager.calculateFee(owner.address, amount, false, true, false, false, 0, 0);
    const bs1 = await feeManager.baseSellFee();
    const stakingPct = bs1 * 90n / 100n;
    expect(fee).to.equal(amount * stakingPct / 100n);

    // VIP (-2%)
    fee = await feeManager.calculateFee(owner.address, amount, false, false, true, false, 0, 0);
    const bs2 = await feeManager.baseSellFee();
    expect(fee).to.equal(amount * (bs2 - 2n) / 100n);

    // whale (+3%)
    fee = await feeManager.calculateFee(owner.address, amount, false, false, false, true, 0, 0);
    const bs3 = await feeManager.baseSellFee();
    expect(fee).to.equal(amount * (bs3 + 3n) / 100n);

    // holdingDuration > 30 days (-1%)
    fee = await feeManager.calculateFee(owner.address, amount, false, false, false, false, 31 * 24 * 3600, 0);
    const bs4 = await feeManager.baseSellFee();
    expect(fee).to.equal(amount * (bs4 - 1n) / 100n);

    // holdingDuration > 60 days (-2%)
    fee = await feeManager.calculateFee(owner.address, amount, false, false, false, false, 61 * 24 * 3600, 0);
    const bs5 = await feeManager.baseSellFee();
    expect(fee).to.equal(amount * (bs5 - 2n) / 100n);
  });

  it("calculateFee обнуляет fee при отрицательных корректировках", async function() {
    const amount = ethers.parseUnits("100", 8);
    await feeManager.connect(owner).setBaseSellFee(1); // 1%
    const fee = await feeManager.calculateFee(owner.address, amount, false, true, true, false, 0, 0);
    expect(fee).to.equal(0n);
  });

  it("calculateFee возвращает 0 при nftDiscount >= 100", async function() {
    const amount = ethers.parseUnits("100", 8);
    const fee = await feeManager.calculateFee(owner.address, amount, false, false, false, false, 0, 100);
    expect(fee).to.equal(0n);
  });
});
