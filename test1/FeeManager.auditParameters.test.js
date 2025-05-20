const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("FeeManager – old logic: high/low/default thresholds", function () {
  let owner, mockToken, feeManager;

  before(async function () {
    [owner] = await ethers.getSigners();

    // 1) Deploy a stub ERC20 so FeeManager can call decimals()
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    mockToken = await ERC20Mock.deploy("TK", "TK", owner.address, 1_000);
    await mockToken.waitForDeployment();

    // 2) Deploy FeeManager against that token
    const FeeMgr = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeMgr.deploy(mockToken.target);
    await feeManager.waitForDeployment();

    // 3) Legacy volatility params: high=100, low=10, highVol=150, lowVol=50, default=100
    await feeManager.setVolatilityParams(100, 10, 150, 50, 100);

    // 4) Fund the mockToken contract so it can call updateActivity
    await network.provider.send("hardhat_setBalance", [
      mockToken.target,
      "0x1000000000000000000", // 1 ETH
    ]);
  });

  it("vol ≤ lowThreshold → lowVolatilityValue", async function () {
    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(50);
  });

  it("low < vol < high → defaultVolatilityCoefficient", async function () {
    // impersonate mockToken to bump volume to 50
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [mockToken.target],
    });
    const signer = await ethers.getSigner(mockToken.target);
    await feeManager.connect(signer).updateActivity(owner.address, 50, false);
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [mockToken.target],
    });

    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(100);
  });

  it("vol ≥ highThreshold → highVolatilityValue", async function () {
    // impersonate mockToken to bump volume above 100
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [mockToken.target],
    });
    const signer = await ethers.getSigner(mockToken.target);
    await feeManager.connect(signer).updateActivity(owner.address, 200, false);
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [mockToken.target],
    });

    await feeManager.auditParameters();
    expect(await feeManager.volatilityCoefficient()).to.equal(150);
  });
});
