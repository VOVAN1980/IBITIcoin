const { expect } = require("chai");
const { ethers } = require("hardhat");

/* ────────────────────────────────────────────────────────────────
   UserStatusManager — полное покрытие (актуальный API)
   ──────────────────────────────────────────────────────────────── */
describe("UserStatusManager — full coverage", function () {
  let usm, owner, user1, user2;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    const USM = await ethers.getContractFactory("UserStatusManager");
    usm = await USM.deploy();
    await usm.waitForDeployment();
  });

  /* ─────────── одиночные сеттеры ─────────── */
  it("should set and get VIP status", async () => {
    await usm.setVIPOverride(user1.address, true);
    expect(await usm.isVIPUser(user1.address)).to.equal(true);
    await usm.setVIPOverride(user1.address, false);
    expect(await usm.isVIPUser(user1.address)).to.equal(false);
  });

  it("should set and get Whale status", async () => {
    await usm.setWhaleOverride(user1.address, true);
    expect(await usm.isWhale(user1.address)).to.equal(true);
    await usm.setWhaleOverride(user1.address, false);
    expect(await usm.isWhale(user1.address)).to.equal(false);
  });

  it("should set and get Bot flag", async () => {
    await usm.flagBot(user1.address, true);
    expect(await usm.isFlaggedBot(user1.address)).to.equal(true);
    await usm.flagBot(user1.address, false);
    expect(await usm.isFlaggedBot(user1.address)).to.equal(false);
  });

  /* ───────────── «batch» вручную ──────────── */
  it("should set statuses in batch (loop)", async () => {
    for (const [addr, flag] of [
      [user1.address, true],
      [user2.address, false],
    ]) {
      await usm.setVIPOverride(addr, flag);
    }
    expect(await usm.isVIPUser(user1.address)).to.equal(true);
    expect(await usm.isVIPUser(user2.address)).to.equal(false);

    for (const [addr, flag] of [[user1.address, true]]) {
      await usm.setWhaleOverride(addr, flag);
    }
    expect(await usm.isWhale(user1.address)).to.equal(true);

    for (const [addr, flag] of [[user2.address, true]]) {
      await usm.flagBot(addr, flag);
    }
    expect(await usm.isFlaggedBot(user2.address)).to.equal(true);
  });

  /* ───────────── zero-address note ────────── */
  it("zero address is accepted (no revert)", async () => {
    const ZERO = ethers.ZeroAddress;
    await expect(usm.setVIPOverride(ZERO, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(ZERO, true)).not.to.be.reverted;
    await expect(usm.flagBot(ZERO, true)).not.to.be.reverted;
  });

  /* ───────────── pause behaviour ──────────── */
  it("pause does NOT block setters", async () => {
    await usm.pause();
    await expect(usm.setVIPOverride(user1.address, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(user1.address, true)).not.to.be.reverted;
    await expect(usm.flagBot(user1.address, true)).not.to.be.reverted;
  });

  it("setters still work after unpause", async () => {
    await usm.pause();
    await usm.unpause();
    await usm.setVIPOverride(user1.address, true);
    expect(await usm.isVIPUser(user1.address)).to.equal(true);
  });
});
