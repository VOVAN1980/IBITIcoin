const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager", function () {
  let token, paymentToken, buyback, router, owner, burnAddress;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // IBITI token
    const Token = await ethers.getContractFactory("ERC20MintableMock");
    token = await Token.deploy("IBITI", "IBITI");
    await token.mint(owner.address, ethers.parseUnits("1000000", 8));

    // Payment token (USDT)
    const Payment = await ethers.getContractFactory("ERC20MintableMock");
    paymentToken = await Payment.deploy("USDT", "USDT");
    await paymentToken.mint(owner.address, ethers.parseUnits("1000000", 8));

    // Mock router with multiplier = 1
    const RouterMock = await ethers.getContractFactory("MockRouter");
    router = await RouterMock.deploy(token.target, 1); // mint 1:1

    const path = [paymentToken.target, token.target];
    burnAddress = "0x000000000000000000000000000000000000dEaD";

    const BuybackManager = await ethers.getContractFactory("BuybackManager");
    buyback = await BuybackManager.deploy(
      token.target,
      paymentToken.target,
      router.target,
      path,
      burnAddress,
      0 // burnPercent
    );

    await paymentToken.approve(buyback.target, ethers.MaxUint256);
    await token.approve(buyback.target, ethers.MaxUint256);
  });

  it("should handle burnPercent = 0 (no burn)", async () => {
    await buyback.setBurnPercent(0);
    await paymentToken.transfer(buyback.target, ethers.parseUnits("100", 8)); // triggers router mint

    await expect(buyback.buybackAll(0)).to.emit(buyback, "BoughtBack");

    const remaining = await token.balanceOf(buyback.target);
    expect(remaining).to.equal(ethers.parseUnits("100", 8)); // всё сохранилось
  });

  it("should handle burnPercent = 100 (full burn)", async () => {
    await buyback.setBurnPercent(100);
    await paymentToken.transfer(buyback.target, ethers.parseUnits("100", 8));

    await expect(buyback.buybackAll(0)).to.emit(buyback, "BoughtBack");

    const remaining = await token.balanceOf(buyback.target);
    expect(remaining).to.equal(0); // всё сгорело
  });

  it("should handle burnPercent = 50 (partial burn)", async () => {
    await buyback.setBurnPercent(50);
    await paymentToken.transfer(buyback.target, ethers.parseUnits("100", 8));

    await expect(buyback.buybackAll(0)).to.emit(buyback, "BoughtBack");

    const remaining = await token.balanceOf(buyback.target);
    expect(remaining).to.equal(ethers.parseUnits("50", 8)); // 50% сгорело
  });

  it("should allow owner to withdraw payment token", async () => {
    await paymentToken.transfer(buyback.target, ethers.parseUnits("500", 8));
    const before = await paymentToken.balanceOf(owner.address);

    await buyback.withdrawPaymentToken(owner.address, ethers.parseUnits("123", 8));
    const after = await paymentToken.balanceOf(owner.address);

    expect(after - before).to.equal(ethers.parseUnits("123", 8));
  });

  it("should allow owner to withdraw IBITI token", async () => {
    await token.transfer(buyback.target, ethers.parseUnits("321", 8));
    const before = await token.balanceOf(owner.address);

    await buyback.withdrawIBITI(owner.address, ethers.parseUnits("100", 8));
    const after = await token.balanceOf(owner.address);

    expect(after - before).to.equal(ethers.parseUnits("100", 8));
  });

  it("should emit BurnPercentUpdated", async () => {
    await expect(buyback.setBurnPercent(77))
      .to.emit(buyback, "BurnPercentUpdated");

    expect(await buyback.burnPercent()).to.equal(77);
  });

  it("should revert if burnPercent > 100", async () => {
    await expect(buyback.setBurnPercent(150))
      .to.be.revertedWith("BM: percent out of range");
  });
});
