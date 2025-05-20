// test/MockPair.skimSync.test.js
const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("MockUniswapV2Pair – skim() & sync()", () => {
  it("owner can skim dust and sync reserves", async () => {
    const [owner] = await ethers.getSigners();

    // dummy token just чтобы было что «скимить»
    const Token  = await (await ethers.getContractFactory("ERC20Mock"))
      .deploy("TKN", "TKN", owner.address, 10n ** 20n);
    await Token.waitForDeployment();

    // Mock pair требует два uint112 в конструкторе (reserve0_, reserve1_)
    const Pair   = await (await ethers.getContractFactory("MockUniswapV2Pair"))
      .deploy(0, 0);
    await Pair.waitForDeployment();

    // засыпаем немного «пыли»
    await Token.transfer(Pair.target, 1_000n);
    await Token.transfer(Pair.target, 10n);   // доп. dust

    // вызовы не должны ревертить
    await expect(Pair.skim(owner.address)).to.not.be.reverted;
    await expect(Pair.sync()).to.not.be.reverted;
  });
});

