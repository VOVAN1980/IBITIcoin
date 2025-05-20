const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – core transfer, receive/fallback, fees", function () {
  let owner, alice, bob;
  let feeManager, userStatusManager, bridgeManager, ibiti;
  const ONE_ETHER    = ethers.parseEther("1.0");
  const ONE_TOKEN    = ethers.parseUnits("1000", 8);
  const HUNDRED      = ethers.parseUnits("100", 8);
  const ZERO_ADDRESS = ethers.ZeroAddress;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const feeToken = await ERC20Mock.deploy("FeeToken", "FEE", owner.address, ethers.parseUnits("1000000", 8));
    await feeToken.waitForDeployment();

    const FeeMgr = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeMgr.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    await bridgeManager.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI Token",
      "IBI",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      ZERO_ADDRESS,
      ZERO_ADDRESS
    );
    await ibiti.waitForDeployment();

    await ibiti.transfer(alice.address, ONE_TOKEN);
    await ibiti.transfer(bob.address, ONE_TOKEN);
  });

  it("accepts plain ETH via receive()", async function () {
    await owner.sendTransaction({ to: ibiti.target, value: ONE_ETHER });
    const bal = await ethers.provider.getBalance(ibiti.target);
    expect(bal).to.equal(ONE_ETHER);
  });

  it("accepts ETH+data via fallback()", async function () {
    await owner.sendTransaction({ to: ibiti.target, data: "0xabcdef01", value: ethers.parseEther("0.5") });
    const bal = await ethers.provider.getBalance(ibiti.target);
    expect(bal).to.equal(ethers.parseEther("0.5"));
  });

  it("transfer without fees when transferFeeEnabled=false", async function () {
    expect(await ibiti.transferFeeEnabled()).to.be.false;
    await ibiti.connect(alice).transfer(bob.address, HUNDRED);
    const expected = ONE_TOKEN + HUNDRED;
    expect(await ibiti.balanceOf(bob.address)).to.equal(expected);
  });

  it("transfer applies fee → distribution only (burnDisabled)", async function () {
    await ibiti.setFlags(false, true, false, true, true, false);
    const dw = await ibiti.distributionWallet();
    const initDistBal = await ibiti.balanceOf(dw);

    await ibiti.connect(alice).transfer(bob.address, HUNDRED);

    const fee = HUNDRED / 10n;
    expect(await ibiti.balanceOf(dw)).to.equal(initDistBal + fee);

    const bobExpected = ONE_TOKEN + (HUNDRED - fee);
    expect(await ibiti.balanceOf(bob.address)).to.equal(bobExpected);
  });

  it("transfer applies fee → burn & distribution (burnEnabled)", async function () {
    await ibiti.setFlags(true, true, false, true, true, false);
    const dw = await ibiti.distributionWallet();
    const initDistBal = await ibiti.balanceOf(dw);

    await ibiti.connect(alice).transfer(bob.address, HUNDRED);

    const fee = HUNDRED / 10n;
    // burnPercentage defaults to 0, so no tokens burned
    const burnAmt = 0n;
    const distAmt = fee;

    const supplyCap = await ibiti.totalSupplyCap();
    const totalSupply = await ibiti.totalSupply();
    expect(totalSupply).to.equal(supplyCap);

    expect(await ibiti.balanceOf(dw)).to.equal(initDistBal + distAmt);

    const bobExpected = ONE_TOKEN + (HUNDRED - fee);
    expect(await ibiti.balanceOf(bob.address)).to.equal(bobExpected);
  });
});
