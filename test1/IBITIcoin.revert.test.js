const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – revert paths: transfer and transferFrom", function () {
  let token;
  let owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // ERC20 stub for FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const stubToken = await ERC20Mock.deploy("STUB", "STB", owner.address, 0n);
    await stubToken.waitForDeployment();

    // FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    const feeMgr = await FeeManager.deploy(stubToken.target);
    await feeMgr.waitForDeployment();

    // Other module stubs
    const USM = await ethers.getContractFactory("UserStatusManager");
    const usm = await USM.deploy();           await usm.waitForDeployment();
    const BM  = await ethers.getContractFactory("BridgeManager");
    const bm  = await BM.deploy();            await bm.waitForDeployment();
    const SM  = await ethers.getContractFactory("DummyStakingModule");
    const sm  = await SM.deploy();            await sm.waitForDeployment();
    const DAO = await ethers.getContractFactory("DummyStakingModule");
    const dao = await DAO.deploy();           await dao.waitForDeployment();
    const NFT = await ethers.getContractFactory("NFTDiscount");
    const nft = await NFT.deploy();           await nft.waitForDeployment();

    // Deploy IBITIcoin (9 args)
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBI", "IBI",
      owner.address,      // founderWallet
      owner.address,      // reserveWallet
      feeMgr.target,      // feeManager
      usm.target,         // userStatusManager
      bm.target,          // bridgeManager
      sm.target,          // stakingModule
      dao.target          // daoModule
    );
    await token.waitForDeployment();

    await feeMgr.setTokenContract(token.target);
    await token.setNFTDiscount(nft.target);

    // Give Alice some tokens
    await token.transfer(alice.address, ethers.parseUnits("10", 8));
  });

  it("should revert transfer when amount exceeds balance", async function () {
    const tooMuch = ethers.parseUnits("100", 8);
    await expect(
      token.connect(alice).transfer(bob.address, tooMuch)
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("should revert transferFrom when sender's balance is too low", async function () {
    const tooMuch = ethers.parseUnits("100", 8);
    await token.connect(alice).approve(bob.address, tooMuch);
    await expect(
      token.connect(bob).transferFrom(alice.address, owner.address, tooMuch)
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("should revert transferFrom when allowance is too low", async function () {
    await token.connect(alice).approve(bob.address, ethers.parseUnits("1", 8));
    await expect(
      token.connect(bob).transferFrom(alice.address, owner.address, ethers.parseUnits("5", 8))
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });
});
