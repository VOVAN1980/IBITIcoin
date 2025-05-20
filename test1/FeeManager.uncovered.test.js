const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – uncovered branches", function() {
  let owner;

  it("fallback for tokenDecimals when contract has no decimals()", async function() {
    [owner] = await ethers.getSigners();
    // Deploy a dummy contract without decimals()
    const Dummy = await ethers.getContractFactory("DummyUnstake");
    const dummy = await Dummy.deploy();
    await dummy.waitForDeployment();

    // Deploy FeeManager pointing to dummy
    const FM = await ethers.getContractFactory("FeeManager");
    const fm = await FM.deploy(dummy.target);
    await fm.waitForDeployment();

    // Since dummy has no decimals(), tokenDecimals should fall back to 18
    expect(await fm.tokenDecimals()).to.equal(18);
  });

  it("setBaseBuyFee emits FeeParametersUpdated and updates baseBuyFee", async function() {
    [owner] = await ethers.getSigners();

    // Deploy ERC20Mock to satisfy constructor
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const erc20 = await ERC20Mock.deploy(
      "Mock", "MCK",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await erc20.waitForDeployment();

    // Deploy FeeManager with valid token
    const FM = await ethers.getContractFactory("FeeManager");
    const fm = await FM.deploy(erc20.target);
    await fm.waitForDeployment();

    // Capture other parameters
    const sell = await fm.baseSellFee();
    const min = await fm.minFee();
    const max = await fm.maxFee();
    const decay = await fm.timeDecay();

    // Test setter
    await expect(fm.connect(owner).setBaseBuyFee(33))
      .to.emit(fm, "FeeParametersUpdated").withArgs(
        33n, sell, min, max, decay
      );
    expect(await fm.baseBuyFee()).to.equal(33n);
  });
});
