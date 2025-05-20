const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let deployer, buyback, paymentToken, ibiti, router;
  const amountIn = 10n * 10n ** 9n;

  beforeEach(async () => {
    [deployer] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy("USDT", "USDT", deployer.address, amountIn * 10n);
    ibiti = await ERC20Mock.deploy("IBITI", "IBITI", deployer.address, 0);

    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(await ibiti.getAddress(),2);

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      await ibiti.getAddress(),
      await paymentToken.getAddress(),
      await router.getAddress(),
      [await paymentToken.getAddress(), await ibiti.getAddress()],
      deployer.address,
      0
    );

    await paymentToken.approve(await buyback.getAddress(), amountIn);
    await buyback.depositPayment(amountIn);
  });

  it("buyback should emit BoughtBack and deposit IBITI", async () => {
    await expect(buyback.buybackAll(0))
      .to.emit(buyback, "BoughtBack")
      .withArgs(amountIn, amountIn * 2n, 0);

    const ibitiBal = await ibiti.balanceOf(await buyback.getAddress());
    expect(ibitiBal).to.equal(amountIn * 2n);
  });

  it("withdrawPaymentToken should return tokens to owner", async () => {
    const balBefore = await paymentToken.balanceOf(deployer.address);
    await buyback.withdrawPaymentToken(deployer.address, amountIn);
    const balAfter = await paymentToken.balanceOf(deployer.address);
    expect(balAfter - balBefore).to.equal(amountIn);
  });
});