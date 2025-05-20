const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let owner, alice;
  let paymentToken, ibiti, router, buyback;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy("MockUSD", "USD", owner.address, ethers.parseUnits("1000", 18));
    ibiti = await ERC20Mock.deploy("IBITI", "IBI", owner.address, ethers.parseUnits("1000", 18));

    const Router = await ethers.getContractFactory("MockRouter");
    router = await Router.deploy(await ibiti.getAddress(), 1); // multiplier = 1

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      await ibiti.getAddress(),
      await paymentToken.getAddress(),
      await router.getAddress(),
      [await paymentToken.getAddress(), await ibiti.getAddress()],
      await owner.getAddress(),
      50
    );
  });

  it("reverts on zero amount", async () => {
    await expect(buyback.depositPayment(0)).to.be.revertedWith("BM: zero amount");
  });

  // ... other tests
});