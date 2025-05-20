const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin uncovered branches", function () {
  let ibiti, owner, user, other;

  beforeEach(async () => {
    [owner, user, other] = await ethers.getSigners();

    const FeeManagerMock = await ethers.getContractFactory("MockFeeManager");
    const feeManager = await FeeManagerMock.deploy();

    const UserStatus = await ethers.getContractFactory("DummyUserStatus");
    const userStatus = await UserStatus.deploy();

    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    const bridgeManager = await BridgeManager.deploy();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI",
      "IBITI",
      owner.address,
      other.address,
      feeManager.target,
      userStatus.target,
      bridgeManager.target,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );

    await ibiti.connect(owner).setCoinPriceBNB(ethers.parseUnits("0.015", "ether")); // 0.015 ETH

    await ibiti.connect(owner).transfer(user.address, ethers.parseUnits("1000", 8));
  });

  it("should revert on transferFrom if allowance is insufficient [line 406]", async () => {
    await expect(
      ibiti.connect(user).transferFrom(user.address, other.address, ethers.parseUnits("10", 8))
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("should refund excess BNB [lines 424–425]", async () => {
    // Отправляем 0.02 ETH при цене 0.015 — ожидается возврат 0.005
    await expect(
      ibiti.connect(user).purchaseCoinBNB({ value: ethers.parseUnits("0.02", "ether") })
    ).to.changeEtherBalance(user, ethers.parseUnits("-0.015", "ether")); // net loss
  });
});
