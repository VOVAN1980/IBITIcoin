/* eslint-disable no-await-in-loop */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("⚔️  Jackpot-NFT attack surface", function () {
  let nft, owner, dao, staking, jackpotMinter, user, attacker;

  beforeEach(async () => {
    [owner, dao, staking, jackpotMinter, user, attacker] =
      await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // wire trusted modules & roles
    await nft.connect(owner).setDAOModule(dao.address);
    await nft.connect(owner).setStakingModule(staking.address);
    await nft
      .connect(owner)
      .setJackpotMinter(jackpotMinter.address, true);

    // sanity-check: cap на Jackpot = MaxUint256
    expect(await nft.supplyCap(5)).to.equal(
      ethers.MaxUint256,
      "SupplyCap for Jackpot must be unlimited for test"
    );
  });

  it("❌ обычный пользователь не может минтить Jackpot", async () => {
    await expect(
      nft
        .connect(user)
        .mintJackpot(user.address, 90, "ipfs://user-try")
    ).to.be.revertedWith("Not authorized for Jackpot mint");
  });

  it("✅ владелец успешно минтит один Jackpot", async () => {
    await nft
      .connect(owner)
      .mintJackpot(user.address, 90, "ipfs://single");

    expect(await nft.mintedCount(5)).to.equal(1);
  });

  it("🚨 jackpotMinter может насыпать сколько угодно (stress 1 000)", async function () {
    this.timeout(0);
    const MINTS = 1_000;

    for (let i = 0; i < MINTS; i++) {
      await nft
        .connect(jackpotMinter)
        .mintJackpot(
          attacker.address,
          99,
          `ipfs://jm-${i}`
        );
    }

    expect(await nft.mintedCount(5)).to.equal(MINTS);
    expect(await nft.balanceOf(attacker.address)).to.equal(MINTS);
  });

  it("🛡️ компрометация stakingModule даёт тот же безлимит", async () => {
    // 1️⃣ владелец меняет stakingModule → злоумышленник
    await nft.connect(owner).setStakingModule(attacker.address);

    const LOOP = 50;
    for (let i = 0; i < LOOP; i++) {
      await nft
        .connect(attacker)
        .mintJackpot(
          attacker.address,
          97,
          `ipfs://sm-${i}`
        );
    }

    expect(await nft.balanceOf(attacker.address)).to.equal(50);
  });
});
