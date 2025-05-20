const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AttackContract – flag toggling", () => {
  let DummyUnstake, dummy;
  let AttackContract, atk;
  let attacker;

  before(async () => {
    [, attacker] = await ethers.getSigners();
    DummyUnstake   = await ethers.getContractFactory("DummyUnstake");
    AttackContract = await ethers.getContractFactory("AttackContract");
  });

  beforeEach(async () => {
    dummy = await DummyUnstake.deploy();
    await dummy.waitForDeployment();

    atk   = await AttackContract.deploy(dummy.target);
    await atk.waitForDeployment();
  });

  it("fallback‑вызов ставит attacked = true и повторно не сбрасывается", async () => {
    // до вызова
    expect(await atk.attacked()).to.equal(false);

    // любая tx без data → fallback()
    await attacker.sendTransaction({ to: atk.target, data: "0x" });
    expect(await atk.attacked()).to.equal(true);

    // повторный вызов: attacked остаётся true
    await attacker.sendTransaction({ to: atk.target, data: "0x" });
    expect(await atk.attacked()).to.equal(true);
  });
});
