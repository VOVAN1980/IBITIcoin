// test/BuybackManager.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let owner, user;
  let paymentToken, ibiti, router, buyback;
  const INITIAL_SUPPLY  = "1000";
  const INITIAL_PAYMENT = "100";

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // 1) Deploy paymentToken mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy(
      "Payment Token",
      "PAY",
      owner.address,
      ethers.parseUnits(INITIAL_SUPPLY, 18)
    );
    await paymentToken.waitForDeployment();

    // 2) Deploy IBITI mock
    ibiti = await ERC20Mock.deploy(
      "IBITI Token",
      "IBI",
      owner.address,
      ethers.parseUnits(INITIAL_SUPPLY, 18)
    );
    await ibiti.waitForDeployment();

    // 3) Deploy MockRouter (mints IBITI == amountIn)
    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(await ibiti.getAddress(), 1);
    await router.waitForDeployment();

    // 4) Deploy BuybackManager (burnPercent = 50%)
    const Buyback = await ethers.getContractFactory("BuybackManager");
    buyback = await Buyback.deploy(
      await ibiti.getAddress(),
      await paymentToken.getAddress(),
      await router.getAddress(),
      [await paymentToken.getAddress(), await ibiti.getAddress()],
      await owner.getAddress(),
      50
    );
    await buyback.waitForDeployment();

    // 5) Fund manager with INITIAL_PAYMENT PAYMENT tokens
    await paymentToken
      .connect(owner)
      .transfer(await buyback.getAddress(), ethers.parseUnits(INITIAL_PAYMENT, 18));
  });

  describe("depositPayment", function () {
    it("reverts on zero amount", async function () {
      await expect(
        buyback.connect(user).depositPayment(0n)
      ).to.be.revertedWith("BM: zero amount");
    });

    it("accepts a positive amount", async function () {
      const amt = ethers.parseUnits("10", 18);
      const addr = await buyback.getAddress();
      await paymentToken.connect(owner).approve(addr, amt);

      const before = await paymentToken.balanceOf(addr);
      await buyback.connect(owner).depositPayment(amt);
      const after = await paymentToken.balanceOf(addr);

      expect(after - before).to.equal(amt);
    });
  });

  describe("buybackPercent & buybackAll", function () {
    beforeEach(async function () {
      // top up another 50 PAYMENT
      const more = ethers.parseUnits("50", 18);
      await paymentToken.connect(owner).transfer(await buyback.getAddress(), more);
    });

    it("reverts if pct out of range", async function () {
      await expect(buyback.buybackPercent(0, 0n))
        .to.be.revertedWith("BM: pct out of range");
      await expect(buyback.buybackPercent(101, 0n))
        .to.be.revertedWith("BM: pct out of range");
    });

    it("reverts if no balance", async function () {
      // withdraw all PAYMENT
      const bal = await paymentToken.balanceOf(await buyback.getAddress());
      await buyback.withdrawPaymentToken(owner.address, bal);
      await expect(buyback.buybackAll(0n)).to.be.revertedWith("BM: no balance");
    });

    it("executes buybackPercent correctly", async function () {
      const addr   = await buyback.getAddress();
      const balPAY = await paymentToken.balanceOf(addr);
      const pct    = 50n;
      const amtIn  = (balPAY * pct) / 100n;

      await expect(buyback.buybackPercent(pct, 0n))
        .to.emit(buyback, "BoughtBack")
        .withArgs(
          amtIn,
          amtIn,                    // router mints amtIn IBI
          (amtIn * 50n) / 100n      // burnPercent = 50%
        );
    });

    it("executes buybackAll correctly", async function () {
      const addr   = await buyback.getAddress();
      const balPAY = await paymentToken.balanceOf(addr);

      await expect(buyback.buybackAll(0n))
        .to.emit(buyback, "BoughtBack")
        .withArgs(
          balPAY,
          balPAY,
          (balPAY * 50n) / 100n
        );
    });
  });

  describe("withdraw functions", function () {
    it("withdrawPaymentToken sends PAYMENT back", async function () {
      const amt  = ethers.parseUnits("20", 18);
      const addr = await buyback.getAddress();

      // fund contract
      await paymentToken.connect(owner).transfer(addr, amt);

      const before = await paymentToken.balanceOf(owner.address);
      await expect(
        buyback.connect(owner).withdrawPaymentToken(owner.address, amt)
      )
        .to.emit(buyback, "WithdrawnPayment")
        .withArgs(owner.address, amt);

      const after = await paymentToken.balanceOf(owner.address);
      expect(after - before).to.equal(amt);
    });

    it("withdrawIBITI sends IBITI back", async function () {
      const amt  = ethers.parseUnits("15", 18);
      const addr = await buyback.getAddress();

      // mint IBITI to contract
      await ibiti.mint(addr, amt);

      const before = await ibiti.balanceOf(owner.address);
      await expect(
        buyback.connect(owner).withdrawIBITI(owner.address, amt)
      )
        .to.emit(buyback, "WithdrawnIBITI")
        .withArgs(owner.address, amt);

      const after = await ibiti.balanceOf(owner.address);
      expect(after - before).to.equal(amt);
    });
  });

  describe("administrative", function () {
    it("setBurnPercent updates and emits", async function () {
      await expect(buyback.setBurnPercent(30))
        .to.emit(buyback, "BurnPercentUpdated")
        .withArgs(30);
      expect(await buyback.burnPercent()).to.equal(30);
    });

    it("reverts on invalid burnPercent", async function () {
      await expect(buyback.setBurnPercent(200)).to.be.revertedWith("BM: percent out of range");
    });

    it("setPath enforces all checks", async function () {
      const payAddr = await paymentToken.getAddress();
      const ibiAddr = await ibiti.getAddress();

      // too short
      await expect(buyback.setPath([payAddr]))
        .to.be.revertedWith("BM: path length out of range");

      // wrong start
      await expect(buyback.setPath([ibiAddr, payAddr]))
        .to.be.revertedWith("BM: wrong path start");

      // wrong end
      await expect(buyback.setPath([payAddr, payAddr]))
        .to.be.revertedWith("BM: wrong path end");

      // zero address
      await expect(buyback.setPath([payAddr, ethers.ZeroAddress, ibiAddr]))
        .to.be.revertedWith("BM: zero address in path");

      // duplicate
      await expect(buyback.setPath([payAddr, payAddr, ibiAddr]))
        .to.be.revertedWith("BM: duplicate path segment");

      // simple A→B→A loop — на нём падение по концу пути
      await expect(buyback.setPath([payAddr, ibiAddr, payAddr]))
        .to.be.revertedWith("BM: wrong path end");

      // valid
      const newPath = [payAddr, user.address, ibiAddr];
      await expect(buyback.setPath(newPath))
        .to.emit(buyback, "PathUpdated")
        .withArgs(newPath);
      expect(await buyback.path(0)).to.equal(payAddr);
      expect(await buyback.path(1)).to.equal(user.address);
      expect(await buyback.path(2)).to.equal(ibiAddr);
    });

    it("pause/unpause blocks buybackAll", async function () {
      const amt  = ethers.parseUnits("5", 18);
      const addr = await buyback.getAddress();

      await paymentToken.connect(owner).approve(addr, amt);
      await buyback.depositPayment(amt);

      await buyback.pause();
      await expect(buyback.buybackAll(0n)).to.be.revertedWith("Pausable: paused");
      await buyback.unpause();
      await expect(buyback.buybackAll(0n)).not.to.be.reverted;
    });
  });
});
