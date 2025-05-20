// test/FeeManager.auditParameters.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Fund an address with 1 ETH and impersonate it.
 */
async function fundAndImpersonate(addr) {
  // Give 1 ETH for gas
  await ethers.provider.send("hardhat_setBalance", [
    addr,
    "0xDE0B6B3A7640000" // 1 ETH
  ]);
  // Start impersonation
  await ethers.provider.send("hardhat_impersonateAccount", [addr]);
  return ethers.getSigner(addr);
}

describe("FeeManager – auditParameters and volatility branches", function () {
  let owner, user;
  let tokenMock, feeManager;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy ERC20Mock with 8 decimals
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    tokenMock = await ERC20Mock.deploy(
      "TKN",
      "TKN",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await tokenMock.waitForDeployment();

    // Deploy FeeManager with tokenMock
    const FM = await ethers.getContractFactory("FeeManager");
    feeManager = await FM.deploy(tokenMock.target);
    await feeManager.waitForDeployment();
  });

  it("legacy logic: vol <= lowThreshold branch", async () => {
    await feeManager.setVolatilityParams(1000, 500, 300, 120, 200);
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(120);
  });

  it("legacy logic: vol >= highThreshold branch", async () => {
    await feeManager.setVolatilityParams(1000, 500, 300, 120, 200);
    const tokenSigner = await fundAndImpersonate(tokenMock.target);
    await feeManager.connect(tokenSigner).updateActivity(user.address, 1500, true);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [tokenMock.target]);
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(300);
  });

  it("legacy logic: lowThreshold < vol < highThreshold branch", async () => {
    await feeManager.setVolatilityParams(1000, 500, 300, 120, 200);
    const tokenSigner = await fundAndImpersonate(tokenMock.target);
    await feeManager.connect(tokenSigner).updateActivity(user.address, 700, true);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [tokenMock.target]);
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(200);
  });

  it("tier logic: rejects too many tiers", async () => {
    const tiers = Array(11).fill({ volumeThreshold: 1, volatilityValue: 10 });
    await expect(feeManager.setVolatilityTiers(tiers)).to.be.revertedWith(
      "Too many tiers"
    );
  });

  it("tier logic: rejects unsorted tiers", async () => {
    const tiers = [
      { volumeThreshold: 1000, volatilityValue: 100 },
      { volumeThreshold: 500, volatilityValue: 50 },
    ];
    await expect(feeManager.setVolatilityTiers(tiers)).to.be.revertedWith(
      "Volatility tiers must be sorted"
    );
  });

  it("tier logic: applies correct tier value", async () => {
    // Set default coefficient = 100
    await feeManager.setVolatilityParams(0, 0, 0, 0, 100);

    const tiers = [
      { volumeThreshold: 100, volatilityValue: 110 },
      { volumeThreshold: 500, volatilityValue: 130 },
      { volumeThreshold: 1000, volatilityValue: 150 },
    ];
    await feeManager.setVolatilityTiers(tiers);

    // 1) vol = 0 -> default
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(100);

    // 2) vol = 600 -> second tier (130)
    const tokenSigner = await fundAndImpersonate(tokenMock.target);
    await feeManager.connect(tokenSigner).updateActivity(user.address, 600, true);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [tokenMock.target]);
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(130);
  });
});
