const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin — rescueETH (lines 632–634)", function () {
  let owner, recipient;
  let mockToken, feeManager, userStatusMgr, bridgeMgr, ibiti;

  const ZERO = ethers.ZeroAddress;
  const ONE_ETH = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, recipient] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    mockToken = await ERC20Mock.deploy("MockToken", "MTK", owner.address, 1000);
    await mockToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(mockToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusMgr = await USM.deploy();
    await userStatusMgr.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeMgr = await BM.deploy();
    await bridgeMgr.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "TestToken",
      "TTK",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusMgr.target,
      bridgeMgr.target,
      ZERO,
      ZERO
    );
    await ibiti.waitForDeployment();
  });

  it("reverts when recipient is zero address", async function () {
    await expect(ibiti.rescueETH(ZERO)).to.be.reverted;
  });

  it("transfers entire ETH balance and emits ETHRescued", async function () {
    // закидываем 1 ETH на контракт
    await owner.sendTransaction({
      to: ibiti.target,
      value: ONE_ETH,
    });

    // проверяем баланс контракта
    expect(await ethers.provider.getBalance(ibiti.target)).to.equal(ONE_ETH);

    // баланс получателя до
    const before = await ethers.provider.getBalance(recipient.address);

    // вызов rescueETH
    await expect(ibiti.rescueETH(recipient.address))
      .to.emit(ibiti, "ETHRescued")
      .withArgs(recipient.address, ONE_ETH);

    // баланс после и проверка разницы
    const after = await ethers.provider.getBalance(recipient.address);
    expect(after - before).to.equal(ONE_ETH);

    // контракт должен обнулить свой баланс
    expect(await ethers.provider.getBalance(ibiti.target)).to.equal(0n);
  });
});
