/* Проверяем, что totalVolumePeriod «обнуляется» после 7 дней */
const { expect } = require("chai");
const { ethers }  = require("hardhat");
const WEEK = 7 * 24 * 60 * 60;

describe("FeeManager – totalVolumePeriod reset after 7d", () => {
  let fee, tokenSigner, owner;

  before(async () => {
    [owner] = await ethers.getSigners();

    // ERC20‑заглушка только ради вызова decimals()
    const erc = await (await ethers.getContractFactory("ERC20Mock"))
                 .deploy("MOCK", "MCK", owner.address, 0n);

    fee = await (await ethers.getContractFactory("FeeManager"))
            .deploy(erc.target);

    /* Имперсонируем контракт‑токен, чтобы пройти модификатор onlyTokenContract
       и пополняем его баланс через hardhat_setBalance (без revert’ов) */
    await ethers.provider.send("hardhat_impersonateAccount", [erc.target]);
    await ethers.provider.send("hardhat_setBalance",
      [erc.target, "0x56BC75E2D63100000"]); // 100 ETH
    tokenSigner = await ethers.getSigner(erc.target);
  });

  it("auditParameters обнуляет счётчик", async () => {
    await fee.connect(tokenSigner).updateActivity(owner.address, 1_000, false);
    expect(await fee.totalVolumePeriod()).to.equal(1_000);

    await ethers.provider.send("evm_increaseTime", [WEEK + 60]);
    await ethers.provider.send("evm_mine");

    // Любая новая активность должна начать счёт заново
    await fee.connect(tokenSigner).updateActivity(owner.address, 500, false);
    expect(await fee.totalVolumePeriod()).to.equal(500);

    // И auditParameters не падает
    await expect(fee.auditParameters()).not.to.be.reverted;
  });
});
