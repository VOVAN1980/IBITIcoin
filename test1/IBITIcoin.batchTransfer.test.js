const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin.batchTransfer", function () {
  let ibiti, feeManager, userStatus, bridgeManager;
  let owner, alice, bob, carol;
  const MAX_BATCH = 100;

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const dummyToken = await ERC20Mock.deploy("DUMMY", "DUM", owner.address, ethers.parseUnits("1", 8));
    await dummyToken.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(dummyToken.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatus = await USM.deploy();
    await userStatus.waitForDeployment();

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
      userStatus.target,
      bridgeManager.target,
      owner.address,
      ethers.ZeroAddress
    );
    await ibiti.waitForDeployment();

    await ibiti.transfer(alice.address, ethers.parseUnits("1000", 8));
  });

  it("reverts when arrays length mismatch", async function () {
    await expect(
      ibiti.connect(alice).batchTransfer(
        [bob.address, carol.address],
        [ethers.parseUnits("1", 8)]
      )
    ).to.be.reverted;
  });

  it("reverts when too many recipients", async function () {
    const recs = Array(MAX_BATCH + 1).fill(bob.address);
    const amts = Array(MAX_BATCH + 1).fill(ethers.parseUnits("1", 8));
    await expect(
      ibiti.connect(alice).batchTransfer(recs, amts)
    ).to.be.reverted;
  });

  it("reverts if sender frozen", async function () {
    await ibiti.freezeAccount(alice.address);
    await expect(
      ibiti.connect(alice).batchTransfer(
        [bob.address],
        [ethers.parseUnits("1", 8)]
      )
    ).to.be.reverted;
  });

  it("reverts if any recipient frozen", async function () {
    await ibiti.freezeAccount(bob.address);
    await expect(
      ibiti.connect(alice).batchTransfer(
        [bob.address],
        [ethers.parseUnits("1", 8)]
      )
    ).to.be.reverted;
  });

  it("transfers correctly and emits BatchTransfer", async function () {
    const a1 = ethers.parseUnits("10", 8);
    const a2 = ethers.parseUnits("20", 8);
    const beforeA = await ibiti.balanceOf(alice.address);
    const beforeB = await ibiti.balanceOf(bob.address);
    const beforeC = await ibiti.balanceOf(carol.address);

    await expect(
      ibiti.connect(alice).batchTransfer(
        [bob.address, carol.address],
        [a1, a2]
      )
    )
      .to.emit(ibiti, "BatchTransfer")
      .withArgs(alice.address, a1 + a2);

    expect(await ibiti.balanceOf(alice.address)).to.equal(beforeA - (a1 + a2));
    expect(await ibiti.balanceOf(bob.address)).to.equal(beforeB + a1);
    expect(await ibiti.balanceOf(carol.address)).to.equal(beforeC + a2);
  });
});
