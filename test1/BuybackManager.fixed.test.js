const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", () => {
  let Buyback, buyback;
  let PAYMENT, IBITI, router;
  let owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    PAYMENT = await ERC20Mock.deploy("MockUSD", "USD", owner.address, ethers.parseUnits("1000", 18));
    IBITI = await ERC20Mock.deploy("IBITI", "IBI", owner.address, 0);

    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(IBITI.target, 2); // ✅ Fixed: added multiplier

    Buyback = await ethers.getContractFactory("BuybackManager");
    buyback = await Buyback.deploy(
      IBITI.target,
      PAYMENT.target,
      router.target,
      [PAYMENT.target, IBITI.target],
      owner.address,
      0
    );
  });

  it("accepts deposits", async () => {
    const amount = ethers.parseUnits("50", 18);

    await PAYMENT.approve(buyback.target, amount);
    await buyback.depositPayment(amount);

    expect(await PAYMENT.balanceOf(buyback.target)).to.equal(amount);
  });
});