const { expect } = require("chai");
const { ethers } = require("hardhat");

const VolatilityTiersUpdatedABI = [
  "event VolatilityTiersUpdated(tuple(uint256 volumeThreshold, uint256 volatilityValue)[] tiers)"
];

describe("ExtraMissingCoverage Tests", function () {
  let FeeManager, feeManager;
  let ERC20Mock;
  let owner, addr1;
  let mockToken;

  before(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy ERC20Mock with 8 decimals
    ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const initialSupply = ethers.parseUnits("1000", 8);
    mockToken = await ERC20Mock.deploy("TKN", "TKN", owner.address, initialSupply);
    await mockToken.waitForDeployment();

    // Deploy FeeManager with mockToken address
    FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(mockToken.target);
    await feeManager.waitForDeployment();
  });

  it("should set tokenContract and read tokenDecimals from ERC20", async function () {
    const tokenAddr = await feeManager.tokenContract();
    expect(tokenAddr).to.equal(mockToken.target);
    expect(await feeManager.tokenDecimals()).to.equal(8);
  });

  it("should fallback to 18 decimals when deployed with a contract lacking decimals()", async function () {
    const Dummy = await ethers.getContractFactory("DummyUnstake");
    const dummy = await Dummy.deploy();
    await dummy.waitForDeployment();

    const feeManager2 = await FeeManager.deploy(dummy.target);
    await feeManager2.waitForDeployment();

    expect(await feeManager2.tokenDecimals()).to.equal(18);
  });

  it("non-owner cannot set volatility tiers", async function () {
    const tiers = [
      { volumeThreshold: ethers.parseUnits("1000", 8), volatilityValue: 120 }
    ];
    await expect(
      feeManager.connect(addr1).setVolatilityTiers(tiers)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner can set volatility tiers and emits event", async function () {
    const tiers = [
      { volumeThreshold: ethers.parseUnits("1000", 8), volatilityValue: 120 },
      { volumeThreshold: ethers.parseUnits("5000", 8), volatilityValue: 150 }
    ];
    const tx = await feeManager.setVolatilityTiers(tiers);
    const receipt = await tx.wait();

    const iface = new ethers.Interface(VolatilityTiersUpdatedABI);
    const logs = receipt.logs
      .map(log => {
        try {
          return iface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    expect(logs.length).to.be.greaterThan(0);
    expect(logs[0].name).to.equal("VolatilityTiersUpdated");
  });
});