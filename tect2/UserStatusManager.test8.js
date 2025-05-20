const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("UserStatusManager – актуальная логика", () => {
  let usm, owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const USM = await ethers.getContractFactory("UserStatusManager");
    usm = await USM.deploy();
    await usm.waitForDeployment();
  });

  /* ───────── VIP ───────── */
  it("can set and read VIP override", async () => {
    await expect(usm.setVIPOverride(alice.address, true))
      .to.emit(usm, "VIPOverride")
      .withArgs(alice.address, true);

    expect(await usm.isVIPUser(alice.address)).to.equal(true);

    await usm.setVIPOverride(alice.address, false);
    expect(await usm.isVIPUser(alice.address)).to.equal(false);
  });

  /* ───────── Bot ───────── */
  it("flags and unflags bot", async () => {
    await usm.flagBot(bob.address, true);
    expect(await usm.isFlaggedBot(bob.address)).to.equal(true);

    await usm.flagBot(bob.address, false);
    expect(await usm.isFlaggedBot(bob.address)).to.equal(false);
  });

  /* ───────── Whale ─────── */
  it("sets Whale override", async () => {
    await usm.setWhaleOverride(alice.address, true);
    expect(await usm.isWhale(alice.address)).to.equal(true);
  });

  /* ───────── Pause note ─── */
  it("pause() does NOT block setters (by design)", async () => {
    await usm.pause();
    // функции не имеют whenNotPaused → должны работать
    await expect(usm.setVIPOverride(alice.address, true)).not.to.be.reverted;
    await expect(usm.flagBot(alice.address, true)).not.to.be.reverted;
    await expect(usm.setWhaleOverride(alice.address, true)).not.to.be.reverted;
  });
});
