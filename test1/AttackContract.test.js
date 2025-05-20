const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AttackContract reentrancy", function () {
  let mockToken, attack;
  let deployer;

  beforeEach(async () => {
    [deployer] = await ethers.getSigners();

    // 1) Деплоим мок‑токен
    const Mock = await ethers.getContractFactory("ReentrantMockToken");
    mockToken = await Mock.deploy();
    await mockToken.waitForDeployment();

    // 2) Деплоим AttackContract, указывая адрес мок‑токена
    const Attack = await ethers.getContractFactory("AttackContract");
    attack = await Attack.deploy(mockToken.target);
    await attack.waitForDeployment();

    // 3) Связываем мок‑токен с атакующим контрактом
    await mockToken.connect(deployer).setAttacker(attack.target);
  });

  it("attackUnstake() should call unstakeTokens twice and set attacked=true", async () => {
    // до атаки ни одного вызова
    expect(await mockToken.calls()).to.equal(0n);
    expect(await attack.attacked()).to.equal(false);

    // выполняем атаку
    await expect(attack.attackUnstake()).not.to.be.reverted;

    // после: mockToken.calls == 2, attacked == true
    expect(await mockToken.calls()).to.equal(2n);
    expect(await attack.attacked()).to.equal(true);
  });
});
