
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – constructor, allowance, fee cap coverage", function () {
  const ONE = ethers.parseUnits("1", 8);

  it("reverts constructor with zero wallets", async () => {
    const [owner] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000000", 8));
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    const feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    const userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    const bridge = await BM.deploy();
    await bridge.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");

    await expect(IBITI.deploy(
      "IBI", "IBI",
      ethers.ZeroAddress, ethers.ZeroAddress,
      feeManager.target,
      userStatus.target,
      bridge.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    )).to.be.reverted;
  });

  it("spendAllowance branch in _doTransfer is covered", async () => {
    const [owner, spender] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000000", 8));
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManagerMock");
    const feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    const userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    const bridge = await BM.deploy();
    await bridge.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    const token = await IBITI.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await token.waitForDeployment();
    await token.transfer(spender.address, ONE);
    await token.connect(spender).approve(owner.address, ONE);
    await token.transferFrom(spender.address, owner.address, ONE);
  });

  it("caps fee to amt if fee > amt", async () => {
    const [owner, recipient] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000000", 8));
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManagerMock");
    const feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();
    await feeManager.setMockFee(ethers.parseUnits("999999", 8));

    const USM = await ethers.getContractFactory("UserStatusManager");
    const userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    const bridge = await BM.deploy();
    await bridge.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    const token = await IBITI.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridge.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await token.waitForDeployment();

    await token.transfer(owner.address, ONE);
    await token.setFlags(
      false,
      true,
      false,
      true,
      false,
      false
    );
    await token.transfer(recipient.address, ONE); // <== вместо ZeroAddress
  });
});
