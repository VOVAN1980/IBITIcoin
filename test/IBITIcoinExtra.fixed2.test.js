const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Extra", function() {
  let token, feeManager;
  let owner, alice, bob;
  let userStatusManager, bridgeManager, stakingModule, daoModule, nftContract;

  beforeEach(async function() {
    [owner, alice, bob] = await ethers.getSigners();

    // 1) Deploy ERC20Mock for FeeManager
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20Mock.deploy(
      "FEE", "FEE",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await feeToken.waitForDeployment();

    // 2) Deploy FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    // 3) Deploy other modules
    userStatusManager = await (await ethers.getContractFactory("UserStatusManager")).deploy();
    await userStatusManager.waitForDeployment();
    bridgeManager     = await (await ethers.getContractFactory("BridgeManager")).deploy();
    await bridgeManager.waitForDeployment();
    stakingModule     = await (await ethers.getContractFactory("DummyStakingModule")).deploy();
    await stakingModule.waitForDeployment();
    nftContract       = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await nftContract.waitForDeployment();

    const daoToken = await ERC20Mock.deploy(
      "DAO", "DAO",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await daoToken.waitForDeployment();
    daoModule = await (await ethers.getContractFactory("TestDAOModule"))
      .deploy(daoToken.target, nftContract.target);
    await daoModule.waitForDeployment();

    // 4) Deploy IBITIcoin
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address,        // founderWallet
      owner.address,        // reserveWallet
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      stakingModule.target,
      daoModule.target      // daoModule
    );
    await token.waitForDeployment();

    // 5) Link FeeManager & NFTDiscount
    await feeManager.setTokenContract(token.target);
    await token.setNFTDiscount(nftContract.target);
    await nftContract.setDiscountOperator(token.target);

    // 6) Distribute tokens
    await token.transfer(alice.address, ethers.parseUnits("100", 8));
    await token.transfer(bob.address,   ethers.parseUnits("50",  8));
  });

  it("freezeAccount prevents sending and receiving", async function() {
    const amount = ethers.parseUnits("1", 8);

    // Alice frozen: cannot send
    await token.freezeAccount(alice.address);
    await expect(
      token.connect(alice).transfer(bob.address, amount)
    ).to.be.reverted;

    // Bob frozen: cannot receive
    await token.unfreezeAccount(alice.address);
    await token.freezeAccount(bob.address);
    await expect(
      token.connect(alice).transfer(bob.address, amount)
    ).to.be.reverted;
  });

  it("transfer has no fee by default", async function() {
    const amount = ethers.parseUnits("10", 8);

    const beforeA = await token.balanceOf(alice.address);
    const beforeB = await token.balanceOf(bob.address);
    const beforeO = await token.balanceOf(owner.address);

    // transferFeeEnabled is false by default
    await expect(
      token.connect(alice).transfer(bob.address, amount)
    ).to.not.emit(token, "FounderFeePaid");

    const afterA = await token.balanceOf(alice.address);
    const afterB = await token.balanceOf(bob.address);
    const afterO = await token.balanceOf(owner.address);

    expect(afterA).to.equal(beforeA - amount);
    expect(afterB).to.equal(beforeB + amount);
    expect(afterO).to.equal(beforeO);
  });

  it("transferFrom applies 10% fee (sell), burns half, sends half to founder", async function() {
    // Enable transfer fees
    await token.connect(owner).setTransferFeeEnabled(true);
    // Set burn percentage to 50% for half burn, half distribution
    await token.connect(owner).setBurnPercentage(50);

    const amount = ethers.parseUnits("20", 8);
    await token.connect(alice).approve(alice.address, amount);

    const feeAmt = (amount * 10n) / 100n;        // 10%
    const burnAmt = (feeAmt * 50n) / 100n;
    const rem     = feeAmt - burnAmt;
    const net     = amount - feeAmt;

    const beforeA = await token.balanceOf(alice.address);
    const beforeB = await token.balanceOf(bob.address);
    const beforeO = await token.balanceOf(owner.address);

    await expect(
      token.connect(alice).transferFrom(alice.address, bob.address, amount)
    ).to.emit(token, "FounderFeePaid")
      .withArgs(alice.address, feeAmt);

    const afterA = await token.balanceOf(alice.address);
    const afterB = await token.balanceOf(bob.address);
    const afterO = await token.balanceOf(owner.address);

    expect(afterA).to.equal(beforeA - amount);
    expect(afterB).to.equal(beforeB + net);
    expect(afterO).to.equal(beforeO + rem);
    expect(await token.balanceOf(token.target)).to.equal(0n);
  });
});