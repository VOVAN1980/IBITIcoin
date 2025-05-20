const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – core receive/fallback и rescueETH", function () {
  let owner, recipient;
  let ERC20Mock, FeeManager, UserStatusManager, BridgeManager, IBITI;
  let mockToken, feeMgr, userStatusMgr, bridgeMgr, token;
  const ZERO = ethers.ZeroAddress;
  const ONE_ETH = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, recipient] = await ethers.getSigners();

    // 1) ERC20Mock для FeeManager
    ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    mockToken = await ERC20Mock.deploy("MockToken", "MTK", owner.address, 1000n);
    await mockToken.waitForDeployment();

    // 2) FeeManager
    FeeManager = await ethers.getContractFactory("FeeManager");
    feeMgr = await FeeManager.deploy(mockToken.target);
    await feeMgr.waitForDeployment();

    // 3) UserStatusManager
    UserStatusManager = await ethers.getContractFactory("UserStatusManager");
    userStatusMgr = await UserStatusManager.deploy();
    await userStatusMgr.waitForDeployment();

    // 4) BridgeManager
    BridgeManager = await ethers.getContractFactory("BridgeManager");
    bridgeMgr = await BridgeManager.deploy();
    await bridgeMgr.waitForDeployment();

    // 5) IBITIcoin
    IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBITI",               // name_
      "IBI",                 // symbol_
      owner.address,         // founderWallet
      owner.address,         // reserveWallet
      feeMgr.target,         // feeManager
      userStatusMgr.target,  // userStatusManager
      bridgeMgr.target,      // bridgeManager
      ZERO,                  // stakingModule
      ZERO                   // daoModule
    );
    await token.waitForDeployment();
  });

  it("accepts plain ETH via receive()", async function () {
    await owner.sendTransaction({ to: token.target, value: ONE_ETH });
    expect(await ethers.provider.getBalance(token.target)).to.equal(ONE_ETH);
  });

  it("accepts ETH+data via fallback()", async function () {
    await owner.sendTransaction({
      to: token.target,
      data: "0xabcdef01",
      value: ethers.parseEther("0.5")
    });
    expect(await ethers.provider.getBalance(token.target))
      .to.equal(ethers.parseEther("0.5"));
  });

  it("reverts rescueETH на нулевой адрес", async function () {
    await expect(token.rescueETH(ZERO)).to.be.reverted;
  });

  it("rescueETH переводит весь баланс и эмитит событие ETHRescued", async function () {
    // закидываем 1 ETH
    await owner.sendTransaction({ to: token.target, value: ONE_ETH });
    expect(await ethers.provider.getBalance(token.target)).to.equal(ONE_ETH);

    // rescueETH → событие + обнуление баланса
    await expect(token.rescueETH(recipient.address))
      .to.emit(token, "ETHRescued")
      .withArgs(recipient.address, ONE_ETH);

    expect(await ethers.provider.getBalance(token.target)).to.equal(0n);
  });
});
