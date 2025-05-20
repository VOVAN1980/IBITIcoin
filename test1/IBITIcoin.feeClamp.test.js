const { expect } = require("chai");
const { ethers } = require("hardhat");
const ONE = 1n; // 1 IBI in raw units (decimals = 8)

describe("IBITIcoin – feeAmt clamp ≤ amount", function () {
  let ibi, feeMgr, owner, seller;

  before(async function () {
    [owner, seller] = await ethers.getSigners();

    // ERC20 stub for FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenStub = await ERC20Mock.deploy(
      "STUB", "STB",
      owner.address,
      0n
    );
    await tokenStub.waitForDeployment();

    // FeeManager with 200% sell fee (>100)
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeMgr = await FeeManager.deploy(tokenStub.target);
    await feeMgr.waitForDeployment();
    await feeMgr.setBaseSellFee(200);

    // Other module stubs
    const USMFactory = await ethers.getContractFactory("UserStatusManager");
    const BMFactory  = await ethers.getContractFactory("BridgeManager");
    const StFactory  = await ethers.getContractFactory("DummyStakingModule");
    const DAOFactory = await ethers.getContractFactory("DummyStakingModule");
    const NFTFactory = await ethers.getContractFactory("NFTDiscount");

    const usm = await USMFactory.deploy();        await usm.waitForDeployment();
    const bm  = await BMFactory.deploy();         await bm.waitForDeployment();
    const st  = await StFactory.deploy();         await st.waitForDeployment();
    const dao = await DAOFactory.deploy();        await dao.waitForDeployment();
    const nft = await NFTFactory.deploy();        await nft.waitForDeployment();

    // Deploy IBITIcoin without NFT in constructor (9 args)
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibi = await IBITI.deploy(
      "IBI", "IBI",
      owner.address,      // founderWallet
      owner.address,      // reserveWallet
      feeMgr.target,      // feeManager
      usm.target,         // userStatusManager
      bm.target,          // bridgeManager
      st.target,          // stakingModule
      dao.target          // daoModule
    );
    await ibi.waitForDeployment();

    // Link FeeManager & NFTDiscount
    await feeMgr.setTokenContract(ibi.target);
    await ibi.setNFTDiscount(nft.target);

    // Give seller 1 IBI
    await ibi.transfer(seller.address, ONE);
  });

  it("sell-fee ≥ amount clamps to amount", async function () {
    // Approve owner for transferFrom
    await ibi.connect(seller).approve(owner.address, ONE);
    // Owner pulls 1 IBI from seller — fee should never exceed amount
    await ibi.connect(owner).transferFrom(seller.address, owner.address, ONE);
    // Seller balance must be exactly zero
    expect(await ibi.balanceOf(seller.address)).to.equal(0n);
  });
});
