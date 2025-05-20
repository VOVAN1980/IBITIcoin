const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin DAO proxy integration", function () {
  let owner, user;
  let ibiti, MockDAOSuccess, daoSuccess, MockDAOFail, daoFail;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Мокаем NFTDiscount, FeeManager, UserStatusManager, BridgeManager, StakingModule
    const Mock = await ethers.getContractFactory("MockFeeManager");
    const feeManager = await Mock.deploy(); await feeManager.waitForDeployment();
    const UserStatus = await ethers.getContractFactory("UserStatusManager");
    const userStatus = await UserStatus.deploy();    await userStatus.waitForDeployment();
    const Bridge = await ethers.getContractFactory("BridgeManager");
    const bridgeManager = await Bridge.deploy();     await bridgeManager.waitForDeployment();
    // простые заглушки под модули, их адреса не важны для DAO
    const stub = owner.address;

    // DAO: два варианта — успешная и проваливающаяся реализация
    const DAOSuccess = await ethers.getContractFactory("MockDAOSuccess");
    daoSuccess = await DAOSuccess.deploy();          await daoSuccess.waitForDeployment();
    const DAOFail    = await ethers.getContractFactory("MockDAOFail");
    daoFail    = await DAOFail.deploy();             await daoFail.waitForDeployment();

    // Деплой IBITIcoin c daoModule=address(0) и потом с daoSuccess, daoFail
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI", "IBI",
      stub, stub,
      feeManager.target,
      userStatus.target,
      bridgeManager.target,
      stub,
      ethers.ZeroAddress   // сначала без DAO
    );
    await ibiti.waitForDeployment();
  });

  it("createProposalSimple returns early when daoModule == address(0)", async () => {
    // не должно revert
    await expect(ibiti.createProposalSimple("desc")).to.not.be.reverted;
  });

  it("forwards to daoModule when createProposalSimple returns true", async () => {
    // переключаем daoModule на daoSuccess
    await ibiti.setDaoModule(daoSuccess.target);
    await expect(ibiti.createProposalSimple("OK"))
      .to.emit(daoSuccess, "Created")   // событие мока
      .withArgs("OK");
  });

  it("reverts when daoModule.createProposalSimple returns false", async () => {
    await ibiti.setDaoModule(daoFail.target);
    await expect(ibiti.createProposalSimple("bad")).to.be.reverted;
  });

  // аналогично для voteProposal и executeProposalSimple
  it("voteProposal returns early when daoModule == address(0)", async () => {
    await expect(ibiti.voteProposal(1, true)).to.not.be.reverted;
  });

  it("executeProposalSimple returns early when daoModule == address(0)", async () => {
    await expect(ibiti.executeProposalSimple(1)).to.not.be.reverted;
  });
});
