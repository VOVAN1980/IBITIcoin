const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UserStatusManager (updated API)", function () {
  let usm, owner, alice, bob, carol;

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const USM = await ethers.getContractFactory("UserStatusManager");
    usm = await USM.deploy();
    await usm.waitForDeployment();
  });

  /* 1 ─ onlyOwner guard */
  it("only owner can call setters", async () => {
    await expect(usm.connect(alice).setVIPOverride(bob.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await expect(usm.connect(alice).flagBot(bob.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await expect(usm.connect(alice).setWhaleOverride(bob.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  /* 2 ─ VIP single */
  it("sets & reads VIP override (single)", async () => {
    await usm.setVIPOverride(alice.address, true);
    expect(await usm.isVIPUser(alice.address)).to.equal(true);
    await usm.setVIPOverride(alice.address, false);
    expect(await usm.isVIPUser(alice.address)).to.equal(false);
  });

  /* 3 ─ Bot single */
  it("sets & reads Bot flag (single)", async () => {
    await usm.flagBot(bob.address, true);
    expect(await usm.isFlaggedBot(bob.address)).to.equal(true);
    await usm.flagBot(bob.address, false);
    expect(await usm.isFlaggedBot(bob.address)).to.equal(false);
  });

  /* 4 ─ Whale single */
  it("sets & reads Whale override (single)", async () => {
    await usm.setWhaleOverride(carol.address, true);
    expect(await usm.isWhale(carol.address)).to.equal(true);
    await usm.setWhaleOverride(carol.address, false);
    expect(await usm.isWhale(carol.address)).to.equal(false);
  });

  /* 5 ─ VIP batch (loop) */
  it("batch-updates VIP via loop", async () => {
    const users = [alice.address, bob.address, carol.address];
    const flags = [true, false, true];
    for (let i = 0; i < users.length; i++) {
      await usm.setVIPOverride(users[i], flags[i]);
    }
    expect(await usm.isVIPUser(alice.address)).to.equal(true);
    expect(await usm.isVIPUser(bob.address)).to.equal(false);
    expect(await usm.isVIPUser(carol.address)).to.equal(true);
  });

  /* 6 ─ Bot batch (loop) */
  it("batch-updates Bot flags via loop", async () => {
    const users = [alice.address, bob.address, carol.address];
    const flags = [false, true, true];
    for (let i = 0; i < users.length; i++) {
      await usm.flagBot(users[i], flags[i]);
    }
    expect(await usm.isFlaggedBot(bob.address)).to.equal(true);
    expect(await usm.isFlaggedBot(alice.address)).to.equal(false);
  });

  /* 7 ─ Whale batch (loop) */
  it("batch-updates Whale overrides via loop", async () => {
    const users = [alice.address, bob.address, carol.address];
    const flags = [true, true, false];
    for (let i = 0; i < users.length; i++) {
      await usm.setWhaleOverride(users[i], flags[i]);
    }
    expect(await usm.isWhale(alice.address)).to.equal(true);
    expect(await usm.isWhale(bob.address)).to.equal(true);
    expect(await usm.isWhale(carol.address)).to.equal(false);
  });

  /* 8 ─ pause doesn’t block setters */
  it("pause() does NOT block setters", async () => {
    await usm.pause();
    await expect(usm.setVIPOverride(alice.address, true)).not.to.be.reverted;
    await expect(usm.flagBot(alice.address, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(alice.address, true)).not.to.be.reverted;
  });

  /* 9 ─ setters still work after unpause */
  it("setters work after unpause", async () => {
    await usm.pause();
    await usm.unpause();
    await usm.setVIPOverride(alice.address, true);
    expect(await usm.isVIPUser(alice.address)).to.equal(true);
  });

  /* 10 ─ zero address accepted */
  it("zero address inputs are accepted", async () => {
    const ZERO = ethers.ZeroAddress;
    await expect(usm.setVIPOverride(ZERO, true)).not.to.be.reverted;
    await expect(usm.flagBot(ZERO, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(ZERO, true)).not.to.be.reverted;
  });
});
