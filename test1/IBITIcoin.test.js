const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin", function() {
  let token;
  let owner, alice, bob;
  let feeManager, userStatusManager, bridgeManager, dummyStaking, daoModule, nftContract;

  beforeEach(async function() {
    [owner, alice, bob] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20Mock.deploy(
      "FeeToken",
      "FEE",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await feeToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    await bridgeManager.waitForDeployment();

    const DSM = await ethers.getContractFactory("DummyStakingModule");
    dummyStaking = await DSM.deploy();
    await dummyStaking.waitForDeployment();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftContract = await NFTDiscount.deploy();
    await nftContract.waitForDeployment();

    const TestDAOModule = await ethers.getContractFactory("TestDAOModule");
    daoModule = await TestDAOModule.deploy(feeToken.target, nftContract.target);
    await daoModule.waitForDeployment();

    const IBITIcoin = await ethers.getContractFactory("IBITIcoin");
    token = await IBITIcoin.deploy(
      "IBITI",
      "IBI",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      dummyStaking.target,
      daoModule.target
    );
    await token.waitForDeployment();

    await feeManager.setTokenContract(token.target);
    await token.setNFTDiscount(nftContract.target);

    const amount = ethers.parseUnits("100", 8);
    await token.transfer(alice.address, amount);
    await token.transfer(bob.address, amount);
  });

  it("batchTransfer should emit event and update balances", async function() {
    const initialAlice = await token.balanceOf(alice.address);
    const initialBob   = await token.balanceOf(bob.address);

    const sendA = ethers.parseUnits("10", 8);
    const sendB = ethers.parseUnits("5", 8);
    const total = sendA + sendB;

    await expect(
      token.connect(alice).batchTransfer(
        [bob.address, owner.address],
        [sendA, sendB]
      )
    )
      .to.emit(token, "BatchTransfer")
      .withArgs(alice.address, total);

    const finalAlice = await token.balanceOf(alice.address);
    expect(finalAlice).to.equal(initialAlice - total);

    const finalBob = await token.balanceOf(bob.address);
    expect(finalBob).to.equal(initialBob + sendA);
  });
});
