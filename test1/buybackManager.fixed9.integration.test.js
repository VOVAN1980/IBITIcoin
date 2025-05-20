const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager Integration", () => {
  let buyback, paymentToken, ibiti, router, owner;
  const amountIn = ethers.parseUnits("100", 18);

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy("USDT", "USD", owner.address, amountIn * 10n);
    ibiti = await ERC20Mock.deploy("IBITI", "IBI", owner.address, 0n);

    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(ibiti.target, 2); // multiplier = 2

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      ibiti.target,
      paymentToken.target,
      router.target,
      [paymentToken.target, ibiti.target],
      owner.address,
      50 // 50% burn
    );

    await paymentToken.approve(buyback.target, amountIn);
    await buyback.depositPayment(amountIn);
  });

  it("deposit, buybackAll, burning logic", async () => {
    await expect(buyback.buybackAll(0))
      .to.emit(buyback, "BoughtBack")
      .withArgs(amountIn, amountIn * 2n, amountIn); // burn = 50% of output

    const ibitiBalance = await ibiti.balanceOf(buyback.target);
    expect(ibitiBalance).to.equal(amountIn); // 50% retained
  });
});