const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin ETH receive() and fallback()", function () {
  let owner, other, ibiti;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBI Token",             // name_
      "IBI",                   // symbol_
      owner.address,           // founderWallet
      owner.address,           // reserveWallet
      ethers.ZeroAddress,      // feeManager
      ethers.ZeroAddress,      // userStatusManager
      ethers.ZeroAddress,      // bridgeManager
      ethers.ZeroAddress,      // stakingModule
      ethers.ZeroAddress       // daoModule
    );
    await ibiti.waitForDeployment();
  });

  it("should accept plain ETH via receive()", async function () {
    // Отправляем 1 ETH без data
    await other.sendTransaction({
      to: ibiti.target,
      value: ethers.parseEther("1")
    });
    const bal = await ethers.provider.getBalance(ibiti.target);
    expect(bal).to.equal(ethers.parseEther("1"));
  });

  it("should accept ETH+data via fallback()", async function () {
    // Отправляем 0.5 ETH с любыми данными
    await other.sendTransaction({
      to: ibiti.target,
      value: ethers.parseEther("0.5"),
      data: "0x1234"
    });
    const bal = await ethers.provider.getBalance(ibiti.target);
    expect(bal).to.equal(ethers.parseEther("0.5"));
  });
});
