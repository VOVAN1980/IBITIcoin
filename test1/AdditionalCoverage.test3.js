const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – сеттеры min/max/timeDecay", function() {
  let owner, feeManager, erc20;

  before(async () => {
    [owner] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    erc20 = await ERC20Mock.deploy(
      "Mock", "MCK",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await erc20.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(erc20.target);
    await feeManager.waitForDeployment();
  });

  it("правильно эмитит FeeParametersUpdated и сохраняет значения", async () => {
    const buy = await feeManager.baseBuyFee();
    const sell = await feeManager.baseSellFee();
    const time0 = await feeManager.timeDecay();

    // minFee
    await expect(feeManager.connect(owner).setMinFee(11))
      .to.emit(feeManager, "FeeParametersUpdated").withArgs(buy, sell, 11, await feeManager.maxFee(), time0);
    expect(await feeManager.minFee()).to.equal(11);

    // maxFee
    await expect(feeManager.connect(owner).setMaxFee(88))
      .to.emit(feeManager, "FeeParametersUpdated").withArgs(buy, sell, 11, 88, time0);
    expect(await feeManager.maxFee()).to.equal(88);

    // timeDecay
    await expect(feeManager.connect(owner).setTimeDecay(4321))
      .to.emit(feeManager, "FeeParametersUpdated").withArgs(buy, sell, 11, 88, 4321);
    expect(await feeManager.timeDecay()).to.equal(4321);
  });
});
