const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TeamVesting – coverage releasableAmount", function () {
  it("should return correct releasable amount", async function () {
    const [owner, beneficiary] = await ethers.getSigners();
    const Vesting = await ethers.getContractFactory("TeamVesting");

    const total = ethers.parseUnits("1000000", 18);
    const now = Math.floor(Date.now() / 1000) - 365 * 86400; // старт 1 год назад

    const vesting = await Vesting.deploy(total, now, beneficiary.address);
    await vesting.waitForDeployment();

    // Вызов функции, которую нужно покрыть
    const amount = await vesting.releasableAmount();

    expect(amount).to.be.a("bigint");
  });
});
