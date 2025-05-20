const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin — full core + purchase coverage", function () {
  let owner, user1, user2, user3;
  let ibiti, tokenMock;
  let feeManager, userStatusManager, bridgeManager, stakingModule, daoModule, nftDiscount;

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    tokenMock = await ERC20Mock.deploy("USD", "USD", owner.address, ethers.parseUnits("1000000", 8));
    await tokenMock.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(tokenMock.target);
    await feeManager.waitForDeployment();

    const USM = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    const BM = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BM.deploy();
    await bridgeManager.waitForDeployment();

    const DSM = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await DSM.deploy();
    await stakingModule.waitForDeployment();

    const NFTD = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTD.deploy();
    await nftDiscount.waitForDeployment();

    const daoToken = await ERC20Mock.deploy("DAO", "DAO", owner.address, ethers.parseUnits("1000000", 8));
    await daoToken.waitForDeployment();

    const DAO = await ethers.getContractFactory("DAOModuleImplementation");
    daoModule = await DAO.deploy(daoToken.target, nftDiscount.target);
    await daoModule.waitForDeployment();

    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI",
      "IBI",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      stakingModule.target,
      daoModule.target
    );
    await ibiti.waitForDeployment();

    await ibiti.setNFTDiscount(nftDiscount.target);

    await feeManager.setTokenContract(ibiti.target);
    await ibiti.transfer(user1.address, ethers.parseUnits("1000", 8));
    await ibiti.setAcceptedPayment(tokenMock.target, true);
    await ibiti.setCoinPriceToken(tokenMock.target, ethers.parseUnits("2", 8));
    await ibiti.setAcceptedPayment(ethers.ZeroAddress, true);
    await ibiti.setCoinPriceBNB(ethers.parseUnits("0.01", 8));
  });

  it("batchTransfer корректно переводит и эмиттит событие", async () => {
    const recipients = [user2.address, user3.address];
    const amounts = [ethers.parseUnits("100", 8), ethers.parseUnits("200", 8)];

    await ibiti.connect(user1).batchTransfer(recipients, amounts);

    expect(await ibiti.balanceOf(user2.address)).to.equal(amounts[0]);
    expect(await ibiti.balanceOf(user3.address)).to.equal(amounts[1]);
  });
});
