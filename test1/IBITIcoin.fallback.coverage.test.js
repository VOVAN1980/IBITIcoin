const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – fallback() coverage (lines 358, 394, 395)", function () {
  let owner;
  let daoSuccess, daoFail;
  let ibitiSuccess, ibitiFail;
  let feeMgr, USM, BM, stakingModule, NFT;
  const daoIface = new ethers.Interface([
    "function createProposalSimple(string reason) returns (bool)"
  ]);

  before(async () => {
    [owner] = await ethers.getSigners();

    // 1) Deploy NFTDiscount stub
    NFT = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await NFT.waitForDeployment();

    // 2) Deploy ERC20Stub + FeeManager
    const ERC20Stub = await ethers.getContractFactory("ERC20Mock");
    const stub = await ERC20Stub.deploy("STUB", "STUB", owner.address, 0n);
    await stub.waitForDeployment();
    feeMgr = await (await ethers.getContractFactory("FeeManager")).deploy(stub.target);
    await feeMgr.waitForDeployment();

    // 3) Other modules
    USM = await (await ethers.getContractFactory("UserStatusManager")).deploy();
    await USM.waitForDeployment();
    BM  = await (await ethers.getContractFactory("BridgeManager")).deploy();
    await BM.waitForDeployment();
    stakingModule = await (await ethers.getContractFactory("DummyStakingModule")).deploy();
    await stakingModule.waitForDeployment();

    // 4) Deploy two DAOs
    daoSuccess = await (await ethers.getContractFactory("MockDAO")).deploy();
    await daoSuccess.waitForDeployment();
    daoFail = await (await ethers.getContractFactory("TestDAOModule"))
      .deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    await daoFail.waitForDeployment();

    // 5) Deploy IBITIcoin hooked to daoSuccess
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibitiSuccess = await IBITI.deploy(
      "IBI", "IBI",
      owner.address,          // founderWallet
      owner.address,          // reserveWallet
      feeMgr.target,          // feeManager
      USM.target,             // userStatusManager
      BM.target,              // bridgeManager
      stakingModule.target,   // stakingModule
      daoSuccess.target       // daoModule
    );
    await ibitiSuccess.waitForDeployment();
    await ibitiSuccess.setNFTDiscount(NFT.target);

    // 6) Deploy IBITIcoin hooked to daoFail
    ibitiFail = await IBITI.deploy(
      "IBI", "IBI",
      owner.address,
      owner.address,
      feeMgr.target,
      USM.target,
      BM.target,
      stakingModule.target,
      daoFail.target
    );
    await ibitiFail.waitForDeployment();
    await ibitiFail.setNFTDiscount(NFT.target);
  });

  it("delegatecall success → require(ok) passes", async function () {
    const proxy = new ethers.Contract(ibitiSuccess.target, daoIface.fragments, owner);
    await expect(proxy.createProposalSimple("works")).to.not.be.reverted;
  });

  it("delegatecall fail → require(ok) fails", async function () {
  const proxy = new ethers.Contract(ibitiFail.target, daoIface.fragments, owner);
  await expect(proxy.createProposalSimple("fails")).to.be.reverted;
});


  it("daoModule == 0 → returns false (not reverted)", async function () {
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    const zero = await IBITI.deploy(
      "IBI", "IBI",
      owner.address,
      owner.address,
      feeMgr.target,
      USM.target,
      BM.target,
      stakingModule.target,
      ethers.ZeroAddress    // no DAO
    );
    await zero.waitForDeployment();
    await zero.setNFTDiscount(NFT.target);

    const proxy = new ethers.Contract(zero.target, daoIface.fragments, owner);
    const tx = await proxy.createProposalSimple("noop");
    await tx.wait();
  });
});
