const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("UserStatusManager — full coverage (updated API)", function () {
  let usm, owner, alice, bob, carol;

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const USM = await ethers.getContractFactory("UserStatusManager");
    usm = await USM.deploy();
    await usm.waitForDeployment();
  });

  /* ───────────────── 1. onlyOwner ───────────────── */
  it("only owner can set statuses", async () => {
    await expect(usm.connect(alice).setVIPOverride(bob.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await expect(usm.connect(alice).setWhaleOverride(bob.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await expect(usm.connect(alice).flagBot(bob.address, true))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  /* ───────────────── 2. VIP single ───────────────── */
  it("should set and get VIP status", async () => {
    await usm.setVIPOverride(alice.address, true);
    expect(await usm.isVIPUser(alice.address)).to.equal(true);
    await usm.setVIPOverride(alice.address, false);
    expect(await usm.isVIPUser(alice.address)).to.equal(false);
  });

  /* ───────────────── 3. Whale single ─────────────── */
  it("should set and get Whale status", async () => {
    await usm.setWhaleOverride(alice.address, true);
    expect(await usm.isWhale(alice.address)).to.equal(true);
    await usm.setWhaleOverride(alice.address, false);
    expect(await usm.isWhale(alice.address)).to.equal(false);
  });

  /* ───────────────── 4. Bot single ───────────────── */
  it("should set and get Bot flag", async () => {
    await usm.flagBot(alice.address, true);
    expect(await usm.isFlaggedBot(alice.address)).to.equal(true);
    await usm.flagBot(alice.address, false);
    expect(await usm.isFlaggedBot(alice.address)).to.equal(false);
  });

  /* ───────────────── 5. Batch loop ───────────────── */
  it("should set statuses in batch (manual loop)", async () => {
    const users = [alice.address, bob.address, carol.address];
    const vip   = [true, false, true];
    const bots  = [false, true, true];
    const whale = [true, true, false];

    for (let i = 0; i < users.length; i++) {
      await usm.setVIPOverride(users[i], vip[i]);
      await usm.flagBot(users[i], bots[i]);
      await usm.setWhaleOverride(users[i], whale[i]);
    }

    expect(await usm.isVIPUser(alice.address)).to.equal(true);
    expect(await usm.isFlaggedBot(bob.address)).to.equal(true);
    expect(await usm.isWhale(bob.address)).to.equal(true);
    expect(await usm.isWhale(carol.address)).to.equal(false);
  });

  /* ───────────────── 6. Zero address ─────────────── */
  it("zero address input is accepted (no revert)", async () => {
    const ZERO = ethers.ZeroAddress;
    await expect(usm.setVIPOverride(ZERO, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(ZERO, true)).not.to.be.reverted;
    await expect(usm.flagBot(ZERO, true)).not.to.be.reverted;
  });

  /* ───────────────── 7. Pause doesn’t block ──────── */
  it("pause() does NOT block setters", async () => {
    await usm.pause();
    await expect(usm.setVIPOverride(alice.address, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(alice.address, true)).not.to.be.reverted;
    await expect(usm.flagBot(alice.address, true)).not.to.be.reverted;
  });

  /* ───────────────── 8. Unpause works ────────────── */
  it("should allow updates after unpause", async () => {
    await usm.pause();
    await usm.unpause();
    await usm.setVIPOverride(alice.address, true);
    expect(await usm.isVIPUser(alice.address)).to.equal(true);
  });

  /* ───────────────── 9. Clear statuses ───────────── */
  it("owner can clear previously set statuses", async () => {
    await usm.setVIPOverride(alice.address, true);
    await usm.setWhaleOverride(alice.address, true);
    await usm.flagBot(alice.address, true);

    await usm.setVIPOverride(alice.address, false);
    await usm.setWhaleOverride(alice.address, false);
    await usm.flagBot(alice.address, false);

    expect(await usm.isVIPUser(alice.address)).to.equal(false);
    expect(await usm.isWhale(alice.address)).to.equal(false);
    expect(await usm.isFlaggedBot(alice.address)).to.equal(false);
  });

  /* ─────────────────10. Event emission ───────────── */
  it("emits correct events", async () => {
    await expect(usm.setVIPOverride(alice.address, true))
      .to.emit(usm, "VIPOverride")
      .withArgs(alice.address, true);

    await expect(usm.setWhaleOverride(alice.address, true))
      .to.emit(usm, "WhaleOverride")
      .withArgs(alice.address, true);

    await expect(usm.flagBot(alice.address, true))
      .to.emit(usm, "BotFlagUpdated")
      .withArgs(alice.address, true);
  });
});
