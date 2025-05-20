const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TeamVesting – require coverage", () => {
  let token, vesting, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("IBI", "IBI", owner.address, ethers.parseUnits("10000", 8));

    const TeamVesting = await ethers.getContractFactory("TeamVesting");
    vesting = await TeamVesting.deploy(
      ethers.parseUnits("1000", 8),            // allocation
      (await ethers.provider.getBlock("latest")).timestamp + 100, // start
      owner.address                            // beneficiary
    );

    await token.approve(vesting.target, ethers.MaxUint256);
    await token.connect(user).approve(vesting.target, ethers.MaxUint256);
  });

  it("should revert if token not set", async () => {
    await expect(
      vesting.depositTokens(ethers.parseUnits("100", 8))
    ).to.be.revertedWith("Token not set");
  });

  it("should revert if deposit exceeds total allocation", async () => {
    await vesting.setTokenAddress(token.target);
    await vesting.depositTokens(ethers.parseUnits("900", 8)); // OK
    await expect(
      vesting.depositTokens(ethers.parseUnits("200", 8)) // ⛔ 900 + 200 > 1000
    ).to.be.revertedWith("Exceeds allocation");
  });

  it("should revert if non-owner tries to deposit", async () => {
    await vesting.setTokenAddress(token.target);
    await expect(
      vesting.connect(user).depositTokens(ethers.parseUnits("100", 8))
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

   it("TeamVesting: should revert depositTokens if token not set or exceeds allocation", async function () {
    const startTimestamp = (await time.latest()) + 1000;
    const vesting2 = await (await ethers.getContractFactory("TeamVesting")).deploy(
      ethers.parseUnits("1000", 8),
      startTimestamp,
      owner.address
    );

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token2 = await ERC20Mock.deploy("TestToken", "TT", owner.address, ethers.parseUnits("2000", 8));

    // Token not set
    await expect(
      vesting2.depositTokens(ethers.parseUnits("100", 8))
    ).to.be.revertedWith("Token not set");

    // Set token and test Exceeds allocation
    await vesting2.setTokenAddress(token2.target);
    await token2.approve(vesting2.target, ethers.parseUnits("2000", 8));

    await vesting2.depositTokens(ethers.parseUnits("1000", 8));
    await expect(
      vesting2.depositTokens(1)
    ).to.be.revertedWith("Exceeds allocation");
  });
});
