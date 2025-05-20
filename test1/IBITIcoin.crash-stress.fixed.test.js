const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Crash & Stress tests", function () {
  let ibiti;
  let feeManager, userStatusManager, bridgeManager, nftDiscount;
  let owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy(
      "MockToken",
      "MTK",
      owner.address,
      ethers.parseUnits("10000000", 8)
    );
    await token.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    await bridgeManager.waitForDeployment();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI",
      "IBI",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await ibiti.waitForDeployment();

    await feeManager.setTokenContract(ibiti.target);
  });

  describe("Crash tests", function () {
    it("reverts transfer when account frozen", async function () {
      await ibiti.freezeAccount(alice.address);
      await expect(
        ibiti.connect(alice).transfer(bob.address, ethers.parseUnits("1", 8))
      ).to.be.reverted;
    });

    it("reverts batchTransfer on length mismatch", async function () {
      await expect(
        ibiti.batchTransfer(
          [bob.address],
          [ethers.parseUnits("1", 8), ethers.parseUnits("2", 8)]
        )
      ).to.be.reverted;
    });

    it("reverts purchaseCoinBNB when native not accepted", async function () {
      await expect(
        ibiti.connect(alice).purchaseCoinBNB({ value: ethers.parseEther("1") })
      ).to.be.reverted;
    });

    it("reverts purchaseCoinToken when payment not accepted", async function () {
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      const usdt = await ERC20Mock.deploy(
        "USDT",
        "USDT",
        owner.address,
        ethers.parseUnits("1000", 8)
      );
      await usdt.waitForDeployment();

      await usdt.transfer(alice.address, ethers.parseUnits("10", 8));
      await usdt.connect(alice).approve(ibiti.target, ethers.parseUnits("10", 8));

      await expect(
        ibiti.connect(alice).purchaseCoinToken(
          usdt.target,
          ethers.parseUnits("1", 8)
        )
      ).to.be.reverted;
    });

    it("reverts bridgeMint from non-bridge", async function () {
      await expect(
        ibiti.connect(alice).bridgeMint(alice.address, 100)
      ).to.be.reverted;
    });
  });

  describe("Stress tests", function () {
    it("batchTransfer 100 recipients within gas limit", async function () {
      await ibiti.transfer(alice.address, ethers.parseUnits("100000", 8));

      const recipients = Array(100).fill(bob.address);
      const amounts    = Array(100).fill(ethers.parseUnits("1", 8));

      const tx      = await ibiti.connect(alice).batchTransfer(recipients, amounts);
      const receipt = await tx.wait();

      expect(receipt.gasUsed).to.be.lt(5_000_000);
    });
  });
});
