const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Missing Branch Coverage", function () {
  let owner;
  let feeToken, feeManager, userStatus, bridgeManager, stakingModule, nftDiscount;
  let IBITI, ibitiZero, ibitiFalse, ibitiTrue, ibitiRevert;

  before(async () => {
    [owner] = await ethers.getSigners();

    // 1) Auxiliary contracts
    const ERC20Mock      = await ethers.getContractFactory("ERC20Mock");
    feeToken             = await ERC20Mock.deploy("FEE","FEE", owner.address, 0);
    await feeToken.waitForDeployment();

    const FeeManager     = await ethers.getContractFactory("FeeManager");
    feeManager           = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM            = await ethers.getContractFactory("UserStatusManager");
    userStatus           = await USM.deploy();
    await userStatus.waitForDeployment();

    const BM             = await ethers.getContractFactory("BridgeManager");
    bridgeManager        = await BM.deploy();
    await bridgeManager.waitForDeployment();

    const DSM            = await ethers.getContractFactory("DummyStakingModule");
    stakingModule        = await DSM.deploy();
    await stakingModule.waitForDeployment();

    const NFTDiscount    = await ethers.getContractFactory("NFTDiscount");
    nftDiscount          = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    IBITI = await ethers.getContractFactory("IBITIcoin");

    // 2) daoModule == zeroAddress → no revert
    ibitiZero = await IBITI.deploy(
      "IBITI","IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridgeManager.target,
      stakingModule.target,
      ethers.ZeroAddress
    );
    await ibitiZero.waitForDeployment();
    await feeManager.setTokenContract(ibitiZero.target);

    // 3) daoModule returns false → "DAO create failed"
    const MockDAOFalse = await ethers.getContractFactory("MockDAOFalse");
    const daoFalse     = await MockDAOFalse.deploy();
    await daoFalse.waitForDeployment();
    ibitiFalse = await IBITI.deploy(
      "IBITI","IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridgeManager.target,
      stakingModule.target,
      daoFalse.target
    );
    await ibitiFalse.waitForDeployment();
    await feeManager.setTokenContract(ibitiFalse.target);

    // 4) daoModule returns true → **без пороговых токенов** падаем на "Need threshold tokens"
    const tokenForDAO   = await ERC20Mock.deploy("DAO","DAO", owner.address, ethers.parseUnits("1000", 8));
    await tokenForDAO.waitForDeployment();
    const TestDAOModule = await ethers.getContractFactory("TestDAOModule");
    const daoTrue       = await TestDAOModule.deploy(tokenForDAO.target, nftDiscount.target);
    await daoTrue.waitForDeployment();
    ibitiTrue = await IBITI.deploy(
      "IBITI","IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridgeManager.target,
      stakingModule.target,
      daoTrue.target
    );
    await ibitiTrue.waitForDeployment();
    await feeManager.setTokenContract(ibitiTrue.target);

    // 5) daoModule reverts("fail") → propagate "fail"
    const MockDAORevert = await ethers.getContractFactory("MockDAORevert");
    const daoRevert     = await MockDAORevert.deploy();
    await daoRevert.waitForDeployment();
    ibitiRevert = await IBITI.deploy(
      "IBITI","IBI",
      owner.address, owner.address,
      feeManager.target,
      userStatus.target,
      bridgeManager.target,
      stakingModule.target,
      daoRevert.target
    );
    await ibitiRevert.waitForDeployment();
    await feeManager.setTokenContract(ibitiRevert.target);
  });

  it("does nothing when daoModule is unset", async function () {
    await expect(ibitiZero.createProposalSimple("foo")).not.to.be.reverted;
  });

  it("reverts with no reason when DAO returns false", async function () {
    await expect(ibitiFalse.createProposalSimple("foo"))
      .to.be.revertedWithoutReason();   // revert();
  });

  it("reverts for user without 100 IBI even if module returns true", async function () {
    await expect(ibitiTrue.createProposalSimple("foo"))
      .to.be.revertedWith("Need threshold tokens");
  });

  it("reverts with original reason when daoModule reverts", async function () {
    await expect(ibitiRevert.createProposalSimple("foo"))
      .to.be.revertedWith("fail");
  });
});
