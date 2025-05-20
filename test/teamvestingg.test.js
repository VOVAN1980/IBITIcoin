// test/teamvesting.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TeamVesting – edge requires", function () {
  let owner, other, ERC20Mock, TeamVesting, now;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    TeamVesting = await ethers.getContractFactory("TeamVesting");
    now = (await ethers.provider.getBlock("latest")).timestamp;
  });

  it("constructor reverts on zero allocation", async function () {
    await expect(
      TeamVesting.deploy(0, now, other.address)
    ).to.be.revertedWith("Allocation zero");
  });

  it("constructor reverts on zero beneficiary", async function () {
    await expect(
      TeamVesting.deploy(1000, now, ethers.ZeroAddress)
    ).to.be.revertedWith("Beneficiary zero");
  });

  it("setTokenAddress reverts on zero address", async function () {
    const vest = await TeamVesting.deploy(1000, now, other.address);
    await vest.waitForDeployment();
    await expect(
      vest.connect(owner).setTokenAddress(ethers.ZeroAddress)
    ).to.be.revertedWith("Token zero");
  });

  it("setBeneficiary reverts on zero address", async function () {
    const vest = await TeamVesting.deploy(1000, now, other.address);
    await vest.waitForDeployment();
    await expect(
      vest.connect(owner).setBeneficiary(ethers.ZeroAddress)
    ).to.be.revertedWith("Beneficiary zero");
  });

  it("depositTokens reverts if token not set", async function () {
    const vest = await TeamVesting.deploy(1000, now, other.address);
    await vest.waitForDeployment();
    await expect(
      vest.connect(owner).depositTokens(100)
    ).to.be.revertedWith("Token not set");
  });

  it("depositTokens reverts on allocation overflow", async function () {
    const vest = await TeamVesting.deploy(50, now, other.address);
    await vest.waitForDeployment();

    const tokenMock = await ERC20Mock.deploy(
      "T","T", owner.address, ethers.parseEther("1000")
    );
    await tokenMock.waitForDeployment();

    await vest.connect(owner).setTokenAddress(tokenMock.target);

    await expect(
      vest.connect(owner).depositTokens(100)
    ).to.be.revertedWith("Exceeds allocation");
  });
});
