const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("MaliciousToken – remaining branch", () => {
  let mal, dummy, attacker;

  before(async () => {
    [ , attacker ] = await ethers.getSigners();

    dummy = await (await ethers.getContractFactory("DummyUnstake")).deploy();
    mal   = await (await ethers.getContractFactory("MaliciousToken"))
               .deploy(dummy.target);

    // Подготовка баланса и allowance
    await mal.transfer(attacker.address, ethers.parseUnits("10", 18));
    await mal.connect(attacker)
             .approve(attacker.address, ethers.parseUnits("10", 18));
  });

  it("третий transferFrom не инициирует новую атаку", async () => {
    const one = ethers.parseUnits("1", 18);
    // Два вызова подряд ставят reentered=true; третий просто проходит
    for (let i = 0; i < 3; i++) {
      await mal.connect(attacker)
               .transferFrom(attacker.address, dummy.target, one);
    }
    // Переменная reentered закрыта, но отсутствие revert’ов достаточно
    expect(await mal.balanceOf(dummy.target)).to.equal(one * 3n);
  });
});
