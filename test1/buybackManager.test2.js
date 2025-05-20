const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let owner, alice;
  let paymentToken, ibiti, router, buyback;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    // Deploy ERC20Mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy(
      "MockUSD",
      "USD",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await paymentToken.waitForDeployment();

    ibiti = await ERC20Mock.deploy(
      "IBITI",
      "IBI",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await ibiti.waitForDeployment();

    // Deploy MockRouter stub
    const Router = await ethers.getContractFactory("MockRouter");
    router = await Router.deploy(await ibiti.getAddress(),2);
    await router.waitForDeployment();

    // Deploy BuybackManager with burnPercent = 0
    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      await ibiti.getAddress(),            // IBITI
      await paymentToken.getAddress(),     // paymentToken
      await router.getAddress(),           // router
      [await paymentToken.getAddress(), await ibiti.getAddress()], // path
      await owner.getAddress(),            // burnAddress
      0                                    // burnPercent
    );
    await buyback.waitForDeployment();
  });

  it("buybackAll should emit BoughtBack and receive IBITI", async () => {
    const amountIn = ethers.parseUnits("100", 8);
    const c = await buyback.getAddress();

    // Approve and deposit paymentToken to contract
    await paymentToken.connect(owner).approve(c, amountIn);
    await buyback.connect(owner).depositPayment(amountIn);

    // buy back
    await expect(
      buyback.connect(owner).buybackAll(0)
    )
      .to.emit(buyback, "BoughtBack")
      .withArgs(amountIn, amountIn * 2n, 0);  // <-- здесь 2× amountIn

    // paymentToken stays the same
    expect(await paymentToken.balanceOf(c)).to.equal(amountIn);

    // IBITI balance should be 2× amountIn
    expect(await ibiti.balanceOf(c)).to.equal(amountIn * 2n);
  });

  it("withdrawPaymentToken should send tokens back to owner", async () => {
    const amount = ethers.parseUnits("50", 8);
    const c = await buyback.getAddress();

    // депонируем напрямую в контракт
    await paymentToken.connect(owner).approve(c, amount);
    await buyback.connect(owner).depositPayment(amount);

    const before = await paymentToken.balanceOf(owner.address);
    await expect(
      buyback.connect(owner).withdrawPaymentToken(owner.address, amount)
    )
      .to.emit(buyback, "WithdrawnPayment")
      .withArgs(owner.address, amount);
    expect(await paymentToken.balanceOf(owner.address)).to.equal(before + amount);
  });

  it("withdrawIBITI should send IBITI tokens back to owner", async () => {
    const amount = ethers.parseUnits("20", 8);
    const c = await buyback.getAddress();

    // mint IBITI прямо в контракт
    await ibiti.mint(c, amount);

    const before = await ibiti.balanceOf(owner.address);
    await expect(
      buyback.connect(owner).withdrawIBITI(owner.address, amount)
    )
      .to.emit(buyback, "WithdrawnIBITI")
      .withArgs(owner.address, amount);
    expect(await ibiti.balanceOf(owner.address)).to.equal(before + amount);
  });

  describe("Administrative functions", () => {
    it("setPath should update swap path and emit PathUpdated", async () => {
      const p0 = await paymentToken.getAddress();
      const i0 = await ibiti.getAddress();
      await expect(
        buyback.connect(owner).setPath([p0, i0])
      )
        .to.emit(buyback, "PathUpdated")
        .withArgs([p0, i0]);
      expect(await buyback.path(0)).to.eq(p0);
      expect(await buyback.path(1)).to.eq(i0);
    });

    it("pause/unpause should block and allow buyback operations", async () => {
      const amountIn = ethers.parseUnits("10", 8);
      const c = await buyback.getAddress();
      await paymentToken.connect(owner).approve(c, amountIn);
      await buyback.connect(owner).depositPayment(amountIn);

      await buyback.connect(owner).pause();
      await expect(buyback.connect(owner).buybackAll(0)).to.be.revertedWith("Pausable: paused");

      await buyback.connect(owner).unpause();
      await expect(buyback.connect(owner).buybackAll(0)).to.emit(buyback, "BoughtBack");
    });

    it("setBurnPercent should update burn percentage and emit BurnPercentUpdated", async () => {
      await expect(buyback.connect(owner).setBurnPercent(25))
        .to.emit(buyback, "BurnPercentUpdated")
        .withArgs(25);
      expect(await buyback.burnPercent()).to.equal(25);
    });

    it("autoBurn logic: setting burn percent to 100 should burn all purchased tokens", async () => {
      const amountIn = ethers.parseUnits("30", 8);
      const c = await buyback.getAddress();
      await paymentToken.connect(owner).approve(c, amountIn);
      await buyback.connect(owner).depositPayment(amountIn);

      await buyback.connect(owner).setBurnPercent(100);
      await expect(buyback.connect(owner).buybackAll(0)).to.emit(buyback, "BoughtBack");

      // всё IBITI сожжено → в контракте 0 IBITI
      expect(await ibiti.balanceOf(c)).to.equal(0);
    });
  });
});
