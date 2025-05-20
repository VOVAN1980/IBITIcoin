const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager full test suite", () => {
  let buybackManager, paymentToken, ibiti, router;
  let owner;
  const burnPercent = 25;
  const amountIn = ethers.parseUnits("100", 18);

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy("MockUSD", "USD", owner.address, amountIn * 10n);
    ibiti = await ERC20Mock.deploy("IBITI", "IBI", owner.address, 0n);

    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(ibiti.target, 2);

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buybackManager = await BuybackManager.deploy(
      ibiti.target,
      paymentToken.target,
      router.target,
      [paymentToken.target, ibiti.target],
      owner.address,
      burnPercent
    );
  });

  describe("Constructor and getters", () => {
    it("sets initial parameters correctly", async () => {
      expect(await buybackManager.paymentToken()).to.equal(paymentToken.target);
      expect(await buybackManager.ibiti()).to.equal(ibiti.target);
      expect(await buybackManager.router()).to.equal(router.target);
      expect(await buybackManager.burnPercent()).to.equal(burnPercent);
    });
  });
});