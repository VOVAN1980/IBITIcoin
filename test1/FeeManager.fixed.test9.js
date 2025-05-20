const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager", function () {
  let deployer, tokenContract, user, FeeManager, feeManager;
  const DECIMALS = 18n;
  const amount = ethers.parseUnits("1000", DECIMALS);
  const dummyNFTDiscount = 10n;

  beforeEach(async () => {
    [deployer, tokenContract, user] = await ethers.getSigners();

    const DummyToken = await ethers.getContractFactory("ERC20Mock");
    const token = await DummyToken.deploy("Test", "TST", deployer.address, amount);

    const Factory = await ethers.getContractFactory("FeeManager");
    feeManager = await Factory.deploy(token.target);
    await feeManager.setTokenContract(tokenContract.address);
  });

  it("calculates correct fee with base settings", async () => {
    await feeManager.setBaseFees(2, 10);
    const fee = await feeManager.calculateFee(
      user.address, amount, false, false, false, false, 0, 0
    );
    expect(fee).to.equal((amount * 10n) / 100n);
  });

  it("applies staking discount", async () => {
    const fee = await feeManager.calculateFee(
      user.address, amount, false, true, false, false, 0, 0
    );
    expect(fee).to.equal((amount * 9n) / 100n); // baseSellFee 10 * 90%
  });

  it("applies VIP discount", async () => {
    const fee = await feeManager.calculateFee(
      user.address, amount, false, false, true, false, 0, 0
    );
    expect(fee).to.equal((amount * 8n) / 100n); // 10 - 2
  });

  it("applies whale penalty", async () => {
    const fee = await feeManager.calculateFee(
      user.address, amount, false, false, false, true, 0, 0
    );
    expect(fee).to.equal((amount * 13n) / 100n); // 10 + 3
  });

  it("applies holding discount", async () => {
    const fee = await feeManager.calculateFee(
      user.address, amount, false, false, false, false, 70 * 24 * 3600, 0
    );
    expect(fee).to.equal((amount * 8n) / 100n); // 10 - 2
  });

  it("applies NFT discount (10%)", async () => {
    const fee = await feeManager.calculateFee(
      user.address, amount, false, false, false, false, 0, dummyNFTDiscount
    );
    expect(fee).to.equal((amount * 10n * 90n) / 10000n);
  });

  it("updateActivity can only be called by tokenContract", async () => {
    await expect(
      feeManager.connect(user).updateActivity(user.address, 1000, true)
    ).to.be.revertedWith("Only token contract");

    await expect(
      feeManager.connect(tokenContract).updateActivity(user.address, 1000, true)
    ).to.emit(feeManager, "ActivityUpdated");
  });

  it("admin setters work when not paused", async () => {
    await feeManager.setBaseFees(1, 5);
    await feeManager.setMinFee(10);
    await feeManager.setMaxFee(10000);
    await feeManager.setTimeDecay(3600);
    expect(await feeManager.minFee()).to.equal(10);
    expect(await feeManager.maxFee()).to.equal(10000);
  });

  it("setTokenContract only owner & not paused", async () => {
    await expect(feeManager.connect(user).setTokenContract(user.address)).to.be.reverted;
    await feeManager.pause();
    await expect(feeManager.setTokenContract(user.address)).to.be.revertedWith("Pausable: paused");
  });

  it("volatility tiers update", async () => {
    await feeManager.setVolatilityTiers([
      { volumeThreshold: 10000, volatilityValue: 120 },
      { volumeThreshold: 50000, volatilityValue: 150 }
    ]);
    const tier = await feeManager.volatilityTiers(1);
    expect(tier.volatilityValue).to.equal(150);
  });
});