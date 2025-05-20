const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let buyback, paymentToken, ibiti, router, owner;
  const amountIn = 10n * 10n ** 9n;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy("USDT", "USDT", owner.address, amountIn * 10n);
    ibiti = await ERC20Mock.deploy("IBITI", "IBITI", owner.address, 0n);

    const Router = await ethers.getContractFactory("MockRouter");
    router = await Router.deploy(await ibiti.getAddress(), 2); // ✅ fixed constructor

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      await ibiti.getAddress(),
      await paymentToken.getAddress(),
      await router.getAddress(),
      [await paymentToken.getAddress(), await ibiti.getAddress()],
      owner.address,
      0
    );

    await paymentToken.connect(owner).approve(await buyback.getAddress(), amountIn);
    await buyback.depositPayment(amountIn);
  });

  it("buyback should emit BoughtBack and deposit IBITI", async () => {
    await expect(
      buyback.connect(owner).buybackAll(0)
    )
      .to.emit(buyback, "BoughtBack")
      .withArgs(amountIn, amountIn * 2n, 0);

    const ibitiBalance = await ibiti.balanceOf(await buyback.getAddress());
    expect(ibitiBalance).to.equal(amountIn * 2n);
  });
});