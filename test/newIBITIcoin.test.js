// test/newIBITIcoin.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Tests", function () {
  let ibiti, feeManager, userStatusManager, bridgeManager, feeToken;
  let tokenOwner, addr1, addr2;

  beforeEach(async function () {
    [tokenOwner, addr1, addr2] = await ethers.getSigners();

    // Deploy ERC20Mock for FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    feeToken = await ERC20Mock.deploy(
      "FeeToken", "FTKN",
      tokenOwner.address,
      ethers.parseUnits("1000000", 8)
    );
    await feeToken.waitForDeployment();

    // Deploy FeeManager
    const FeeManagerFactory = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerFactory.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    // Deploy UserStatusManager
    const UserStatusManagerFactory = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await UserStatusManagerFactory.deploy();
    await userStatusManager.waitForDeployment();

    // Deploy BridgeManager
    const BridgeManagerFactory = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BridgeManagerFactory.deploy();
    await bridgeManager.waitForDeployment();

    // Deploy IBITIcoin with correct 9 args
    const IBITIcoinFactory = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITIcoinFactory.deploy(
      "IBITIcoin", 
      "IBIT", 
      tokenOwner.address,   // founderWallet
      tokenOwner.address,   // reserveWallet
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      tokenOwner.address,   // stakingModule (dummy)
      tokenOwner.address    // daoModule (dummy)
    );
    await ibiti.waitForDeployment();
  });

  it("should freeze and unfreeze accounts and block transfers", async function () {
    // Freeze addr1
    await expect(ibiti.connect(tokenOwner).freezeAccount(addr1.address))
      .to.emit(ibiti, "AccountFrozen")
      .withArgs(addr1.address);
    
    // addr1 cannot send
    await expect(
      ibiti.connect(addr1).transfer(addr2.address, 100)
    ).to.be.reverted;
    
    // Unfreeze addr1
    await expect(ibiti.connect(tokenOwner).unfreezeAccount(addr1.address))
      .to.emit(ibiti, "AccountUnfrozen")
      .withArgs(addr1.address);
  });

  it("should perform batchTransfer correctly", async function () {
    const recipients = [addr1.address, addr2.address];
    const amounts = [100, 200];

    await expect(
      ibiti.connect(tokenOwner).batchTransfer(recipients, amounts)
    )
      .to.emit(ibiti, "BatchTransfer")
      .withArgs(tokenOwner.address, 300);

    expect(await ibiti.balanceOf(addr1.address)).to.equal(100);
    expect(await ibiti.balanceOf(addr2.address)).to.equal(200);
  });
});
