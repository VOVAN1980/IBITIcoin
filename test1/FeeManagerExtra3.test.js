const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("FeeManager Extra Tests", function () {
  let feeManager, token;
  let owner, user, other;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TestToken",
      "TTK",
      owner.address,
      ethers.parseUnits("1000000", 8)
    );
    await token.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();
  });

  it("should revert updateActivity if called by non-token contract", async function () {
    await expect(
      feeManager.connect(user).updateActivity(user.address, 1000, false)
    ).to.be.revertedWith("Only token contract");
  });

  it("should update user activity properly", async function () {
    await feeManager.setTokenContract(owner.address);
    const tx = await feeManager.connect(owner).updateActivity(user.address, 1000, false);
    await expect(tx)
      .to.emit(feeManager, "ActivityUpdated")
      .withArgs(user.address, 1, 1000, anyValue);
  });

  it("should calculate fee for a buy transaction", async function () {
    // baseBuyFee = 0 in new logic ⇒ fee = 0
    const fee = await feeManager.calculateFee(
      user.address,
      1000,
      true,  // isBuy
      false,
      false,
      false,
      0,
      0
    );
    expect(fee).to.equal(0);
  });

  it("should calculate fee for a sell transaction with VIP discount and long holding", async function () {
    const seconds61Days = 61 * 24 * 3600;
    const fee = await feeManager.calculateFee(
      user.address,
      1000,
      false, // isBuy
      false,
      true,  // isVIP
      false,
      seconds61Days,
      0
    );
    expect(fee).to.equal(60);
  });
});
