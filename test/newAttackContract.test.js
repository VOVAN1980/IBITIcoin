// test/newAttackContract.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AttackContract Tests", function () {
  let attackContract, ibitiCoin, feeManager, feeToken, userStatusManager, bridgeManager, dummyStakingModule;
  let owner, attacker;

  beforeEach(async () => {
    [owner, attacker] = await ethers.getSigners();

    // 1) ERC20Mock for FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    feeToken = await ERC20Mock.deploy(
      "FeeToken", "FTKN",
      owner.address,
      ethers.parseUnits("1000000", 8)
    );
    await feeToken.waitForDeployment();

    // 2) FeeManager
    const FeeManagerFactory = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerFactory.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    // 3) UserStatusManager & BridgeManager
    const USMFactory = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USMFactory.deploy();
    await userStatusManager.waitForDeployment();

    const BMFactory = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BMFactory.deploy();
    await bridgeManager.waitForDeployment();

    // 4) DummyStakingModule
    const DSMFactory = await ethers.getContractFactory("DummyStakingModule");
    dummyStakingModule = await DSMFactory.deploy();
    await dummyStakingModule.waitForDeployment();

    // 5) Deploy IBITIcoin (9 args, without nftContract)
    const IBITIcoinFactory = await ethers.getContractFactory("IBITIcoin");
    ibitiCoin = await IBITIcoinFactory.deploy(
      "IBITIcoin",
      "IBIT",
      owner.address,               // founderWallet
      owner.address,               // reserveWallet
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      dummyStakingModule.target,   // stakingModule
      owner.address                // daoModule (dummy)
    );
    await ibitiCoin.waitForDeployment();

    // 6) Deploy AttackContract
    const AttackContractFactory = await ethers.getContractFactory("AttackContract");
    attackContract = await AttackContractFactory.deploy(ibitiCoin.target);
    await attackContract.waitForDeployment();
  });

  it("should perform attackUnstake call without revert", async () => {
    await expect(
      attackContract.connect(attacker).attackUnstake()
    ).to.not.be.reverted;
  });
});
