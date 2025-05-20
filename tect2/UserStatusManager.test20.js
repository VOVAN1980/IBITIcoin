const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UserStatusManager – thresholds and flags", function () {
  let owner, alice, bob;
  let token, usm;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    // Deploy UserStatusManager
    const USM = await ethers.getContractFactory("UserStatusManager");
    usm = await USM.deploy();
    await usm.waitForDeployment();

    // Deploy ERC20Mock for IBITI token
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20.deploy("IBI Token", "IBI", owner.address, ethers.parseUnits("10000", 18));
    await token.waitForDeployment();
  });

  it("setIBIToken succeeds with valid address, reverts on zero address or second call", async function () {
    // Zero address first should revert "zero addr"
    await expect(
      usm.setIBIToken(ethers.ZeroAddress)
    ).to.be.revertedWith("zero addr");

    // Valid set
    await expect(usm.setIBIToken(token.target))
      .to.emit(usm, "IBITokenSet").withArgs(token.target);
    expect(await usm.ibiToken()).to.equal(token.target);

    // Second call (even with zero address) now reverts "token already set"
    await expect(usm.setIBIToken(token.target))
      .to.be.revertedWith("token already set");
  });

  it("setThresholds updates and emits event (independent of pause)", async function () {
    const vip = ethers.parseUnits("1", 18);
    const whale = ethers.parseUnits("2", 18);
    const stake = ethers.parseUnits("100", 18);
    const holdDays = 7;

    // Even if paused later, thresholds can still be set (no whenNotPaused modifier)
    await expect(usm.setThresholds(vip, whale, stake, holdDays))
      .to.emit(usm, "ThresholdsUpdated").withArgs(vip, whale, stake, holdDays);
    expect(await usm.vipThreshold()).to.equal(vip);
    expect(await usm.whaleThreshold()).to.equal(whale);
    expect(await usm.stakeThreshold()).to.equal(stake);
    expect(await usm.holdThresholdDays()).to.equal(holdDays);
  });

  it("overrides and flags with events and access control", async function () {
    await expect(usm.setVIPOverride(alice.address, true))
      .to.emit(usm, "VIPOverride").withArgs(alice.address, true);
    expect(await usm.isVIPUser(alice.address)).to.be.true;

    await expect(usm.setWhaleOverride(bob.address, true))
      .to.emit(usm, "WhaleOverride").withArgs(bob.address, true);
    expect(await usm.isWhale(bob.address)).to.be.true;

    await expect(usm.flagBot(alice.address, true))
      .to.emit(usm, "BotFlagUpdated").withArgs(alice.address, true);
    expect(await usm.isFlaggedBot(alice.address)).to.be.true;

    // Non-owner cannot override
    await expect(usm.connect(alice).setVIPOverride(bob.address, false))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("isVIPUser and isWhale return false when token not set and threshold logic works when set", async function () {
    // Before token set
    expect(await usm.isVIPUser(alice.address)).to.be.false;
    expect(await usm.isWhale(alice.address)).to.be.false;

    // Set token and thresholds
    await usm.setIBIToken(token.target);
    const vipThr = ethers.parseUnits("100", 18);
    const whaleThr = ethers.parseUnits("200", 18);
    await usm.setThresholds(vipThr, whaleThr, 0, 0);

    // Distribute balances
    await token.transfer(alice.address, vipThr);
    await token.transfer(bob.address, whaleThr);

    expect(await usm.isVIPUser(alice.address)).to.be.true;
    expect(await usm.isWhale(bob.address)).to.be.true;
    expect(await usm.isVIPUser(bob.address)).to.be.true;
    expect(await usm.isWhale(alice.address)).to.be.false;
  });

  it("isStakeQualified returns false when disabled and true when meets threshold", async function () {
    // Default stakeThreshold=0 => disabled
    expect(await usm.isStakeQualified(ethers.parseUnits("1000",18))).to.be.false;
    // Enable stake threshold
    await usm.setThresholds(0,0,ethers.parseUnits("500",18),0);
    expect(await usm.isStakeQualified(ethers.parseUnits("499",18))).to.be.false;
    expect(await usm.isStakeQualified(ethers.parseUnits("500",18))).to.be.true;
  });

  it("hasHoldBonus returns false when disabled or not enough time, true when qualifies", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    // Default disabled
    expect(await usm.hasHoldBonus(now - 1000)).to.be.false;

    // Enable holdDays=1
    await usm.setThresholds(0,0,0,1);
    // Not enough time
    expect(await usm.hasHoldBonus(now)).to.be.false;
    // Exactly 1 day ago
    expect(await usm.hasHoldBonus(now - 86400)).to.be.true;
  });
});
