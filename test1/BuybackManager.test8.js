// test/BuybackManager.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let owner, user;
  let paymentToken, ibiti, router, buyback;
  let paymentAddr, ibitiAddr;
  const ZERO = ethers.ZeroAddress;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // 1) Deploy paymentToken mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy(
      "MockUSD",
      "USD",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await paymentToken.waitForDeployment();
    paymentAddr = await paymentToken.getAddress();

    // 2) Deploy IBITI mock
    ibiti = await ERC20Mock.deploy(
      "IBITI",
      "IBI",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await ibiti.waitForDeployment();
    ibitiAddr = await ibiti.getAddress();

    // 3) Deploy MockRouter (mints IBITI == amountIn)
    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(ibitiAddr, 1); // ✅ multiplier = 1
    await router.waitForDeployment();

    // 4) Deploy BuybackManager with burnPercent = 50%
    const Buyback = await ethers.getContractFactory("BuybackManager");
    buyback = await Buyback.deploy(
      ibitiAddr,
      paymentAddr,
      await router.getAddress(),
      [paymentAddr, ibitiAddr],
      owner.address,
      50
    );
    await buyback.waitForDeployment();

    // 5) Fund manager with 100 PAYMENT tokens
    await paymentToken
      .connect(owner)
      .transfer(await buyback.getAddress(), ethers.parseUnits("100", 8));
  });

  describe("depositPayment", function () {
    it("reverts on zero amount", async function () {
      await expect(
        buyback.connect(user).depositPayment(0n)
      ).to.be.revertedWith("BM: zero amount");
    });

    it("accepts a positive amount", async function () {
      const amt = ethers.parseUnits("10", 8);
      const mgr = await buyback.getAddress();

      await paymentToken.connect(owner).approve(mgr, amt);
      const before = await paymentToken.balanceOf(mgr);

      await buyback.connect(owner).depositPayment(amt);

      const after = await paymentToken.balanceOf(mgr);
      expect(after - before).to.equal(amt);
    });
  });

  describe("buybackPercent & buybackAll", function () {
    beforeEach(async function () {
      // top up another 50 PAYMENT
      const more = ethers.parseUnits("50", 8);
      await paymentToken
        .connect(owner)
        .transfer(
          await buyback.getAddress(),
          more
        );
    });

    it("reverts if pct out of range", async function () {
      await expect(buyback.buybackPercent(0, 0n))
        .to.be.revertedWith("BM: pct out of range");
      await expect(buyback.buybackPercent(101, 0n))
        .to.be.revertedWith("BM: pct out of range");
    });

    it("reverts if no balance for buybackAll", async function () {
      const mgr = await buyback.getAddress();
      const bal = await paymentToken.balanceOf(mgr);
      await buyback.withdrawPaymentToken(owner.address, bal);
      await expect(buyback.buybackAll(0n))
        .to.be.revertedWith("BM: no balance");
    });

    it("executes buybackPercent correctly", async function () {
      const mgr = await buyback.getAddress();
      const balPAY = await paymentToken.balanceOf(mgr);
      const inAmt = (balPAY * 50n) / 100n;
      const expectedBurn = (inAmt * 50n) / 100n;

      await expect(buyback.buybackPercent(50, 0n))
        .to.emit(buyback, "BoughtBack")
        .withArgs(inAmt, inAmt, expectedBurn);
    });

    it("executes buybackAll correctly", async function () {
      const mgr = await buyback.getAddress();
      const balPAY = await paymentToken.balanceOf(mgr);
      const expectedBurn = (balPAY * 50n) / 100n;

      await expect(buyback.buybackAll(0n))
        .to.emit(buyback, "BoughtBack")
        .withArgs(balPAY, balPAY, expectedBurn);
    });
  });

  describe("withdraw functions", function () {
    it("withdrawPaymentToken sends PAYMENT back", async function () {
      const mgr = await buyback.getAddress();
      const amt = ethers.parseUnits("20", 8);

      // fund + withdraw
      await paymentToken.connect(owner).transfer(mgr, amt);
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
      const mgr = await buyback.getAddress();
      const amt = ethers.parseUnits("15", 8);

      // mint + withdraw
      await ibiti.mint(mgr, amt);
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

  describe("administrative functions", function () {
    it("setBurnPercent updates and emits", async function () {
      await expect(buyback.setBurnPercent(25))
        .to.emit(buyback, "BurnPercentUpdated")
        .withArgs(25);
      expect(await buyback.burnPercent()).to.equal(25);
    });

    it("reverts on invalid burnPercent", async function () {
      await expect(buyback.setBurnPercent(200))
        .to.be.revertedWith("BM: percent out of range");
    });

    it("pause/unpause blocks and allows buybackAll", async function () {
      const mgr = await buyback.getAddress();
      const amt = ethers.parseUnits("5", 8);

      await paymentToken.connect(owner).approve(mgr, amt);
      await buyback.depositPayment(amt);

      await buyback.pause();
      await expect(buyback.buybackAll(0n)).to.be.revertedWith("Pausable: paused");
      await buyback.unpause();
      await expect(buyback.buybackAll(0n)).not.to.be.reverted;
    });
  });

  describe("setPath validations", function () {
    it("reverts if length < 2", async function () {
      await expect(
        buyback.setPath([paymentAddr])
      ).to.be.revertedWith("BM: path length out of range");
    });

    it("reverts if length > MAX_PATH_LENGTH", async function () {
      const arr = Array(6).fill(paymentAddr);
      arr[5] = ibitiAddr;
      await expect(
        buyback.setPath(arr)
      ).to.be.revertedWith("BM: path length out of range");
    });

    it("reverts if wrong path start", async function () {
      await expect(
        buyback.setPath([ibitiAddr, paymentAddr])
      ).to.be.revertedWith("BM: wrong path start");
    });

    it("reverts if wrong path end", async function () {
      await expect(
        buyback.setPath([paymentAddr, paymentAddr])
      ).to.be.revertedWith("BM: wrong path end");
    });

    it("reverts if zero address in path", async function () {
      await expect(
        buyback.setPath([paymentAddr, ZERO, ibitiAddr])
      ).to.be.revertedWith("BM: zero address in path");
    });

    it("reverts on duplicate path segment", async function () {
      await expect(
        buyback.setPath([paymentAddr, paymentAddr, ibitiAddr])
      ).to.be.revertedWith("BM: duplicate path segment");
    });

    it("reverts on simple loop A→B→A→B", async function () {
      const loopPath = [paymentAddr, ibitiAddr, paymentAddr, ibitiAddr];
      await expect(
        buyback.setPath(loopPath)
      ).to.be.revertedWith("BM: invalid loop in path");
    });

    it("accepts a valid path", async function () {
      const newPath = [paymentAddr, user.address, ibitiAddr];
      await expect(
        buyback.setPath(newPath)
      )
        .to.emit(buyback, "PathUpdated")
        .withArgs(newPath);

      expect(await buyback.path(0)).to.equal(paymentAddr);
      expect(await buyback.path(1)).to.equal(user.address);
      expect(await buyback.path(2)).to.equal(ibitiAddr);
    });
  });
});
