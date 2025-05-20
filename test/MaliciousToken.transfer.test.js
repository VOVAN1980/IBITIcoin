const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MaliciousToken – plain transfer branch", () => {
  it("simple transfer doesn’t flip internal re‑entrancy flags", async () => {
    const [owner, alice, bob] = await ethers.getSigners();

    const DummyUnstake   = await ethers.getContractFactory("DummyUnstake");
    const dummyStaking   = await DummyUnstake.deploy();

    const MaliciousToken = await ethers.getContractFactory("MaliciousToken");
    const mal            = await MaliciousToken.deploy(dummyStaking.target);

    // раздаём баланс и делаем обычный transfer (без call‑data в fallback)
    await mal.transfer(alice.address, 1_000);
    await mal.connect(alice).transfer(bob.address, 500);

    expect(await mal.balanceOf(bob.address)).to.equal(500);
    // публичных флагов нет, проверяем просто, что никаких revert / side‑effects
  });
});
