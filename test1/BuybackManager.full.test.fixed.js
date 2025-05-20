const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager full test suite", () => {
  let buyback, paymentToken, ibiti, router;
  let owner;
  const burnPercent = 25;
  const amountIn = ethers.parseUnits("100", 18);

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy("MockUSD", "USD", owner.address, amountIn * 10n);
    ibiti = await ERC20Mock.deploy("IBITI", "IBI", owner.address, 0n);

    const Router = await ethers.getContractFactory("MockRouter");
    router = await Router.deploy(await ibiti.getAddress(), 2);

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      await ibiti.getAddress(),
      await paymentToken.getAddress(),
      await router.getAddress(),
      [await paymentToken.getAddress(), await ibiti.getAddress()],
      owner.address,
      burnPercent
    );
    await buyback.waitForDeployment();
  });

  describe("Constructor and getters", () => {
    it("sets initial parameters correctly", async () => {
      expect(await buyback.paymentToken()).to.equal(await paymentToken.getAddress());
      expect(await buyback.ibiti()).to.equal(await ibiti.getAddress());
      expect(await buyback.router()).to.equal(await router.getAddress());
      expect(await buyback.burnPercent()).to.equal(burnPercent);
      expect(await buyback.burnAddress()).to.equal(owner.address);
      expect(await buyback.path(0)).to.equal(await paymentToken.getAddress());
      expect(await buyback.path(1)).to.equal(await ibiti.getAddress());
    });
  });
});
