// test/ibiticore.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin — core functionality", function () {
  let IBITI, ibiti;
  let founder, reserve, alice, bob, carol;
  let DummyFeeMgr, feeMgr;
  let DummyStatus, statusMgr;

  beforeEach(async () => {
    [founder, reserve, alice, bob, carol] = await ethers.getSigners();

    // 1) Разворачиваем DummyFeeManager из contracts/
    DummyFeeMgr = await ethers.getContractFactory("DummyFeeManager");
    feeMgr      = await DummyFeeMgr.deploy();
    await feeMgr.waitForDeployment();

    // 2) Разворачиваем DummyUserStatus из contracts/
    DummyStatus = await ethers.getContractFactory("DummyUserStatus");
    statusMgr   = await DummyStatus.deploy();
    await statusMgr.waitForDeployment();

    // 3) Разворачиваем IBITIcoin с заглушками
    IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITIcoin", "IBITI",
      founder.address,                // founderWallet
      reserve.address,                // reserveWallet
      feeMgr.target,                  // feeManager → DummyFeeManager
      statusMgr.target,               // userStatusManager → DummyUserStatus
      ethers.ZeroAddress,             // bridgeManager (тут не важно)
      ethers.ZeroAddress,             // stakingModule
      ethers.ZeroAddress              // daoModule
    );
    await ibiti.waitForDeployment();
  });

  it("batchTransfer корректно переводит и эмитит событие", async () => {
    // founder раздаёт 100 IBI Alice
    await ibiti.connect(founder).batchTransfer([alice.address], [100]);
    expect(await ibiti.balanceOf(alice.address)).to.equal(100);

    // Alice рассылает: 30 → Bob, 20 → Carol
    await expect(
      ibiti.connect(alice).batchTransfer(
        [bob.address, carol.address],
        [30, 20]
      )
    )
      .to.emit(ibiti, "BatchTransfer")
      .withArgs(alice.address, 50);

    expect(await ibiti.balanceOf(bob.address)).to.equal(30);
    expect(await ibiti.balanceOf(carol.address)).to.equal(20);
    expect(await ibiti.balanceOf(alice.address)).to.equal(50);
  });

  it("freezeAccount блокирует отправку в batchTransfer", async () => {
    await ibiti.connect(founder).batchTransfer([alice.address], [10]);
    await ibiti.connect(founder).pause(); // optional, если хотите проверить pause
    await ibiti.connect(founder).unpause();

    await ibiti.connect(founder).batchTransfer([alice.address], [10]);
    await ibiti.connect(founder).freezeAccount(alice.address);
    await expect(
      ibiti.connect(alice).batchTransfer([bob.address], [5])
    ).to.be.reverted;
  });

  it("freezeAccount блокирует получение в batchTransfer", async () => {
    await ibiti.connect(founder).freezeAccount(bob.address);
    await expect(
      ibiti.connect(founder).batchTransfer([bob.address], [1])
    ).to.be.reverted;
  });

  it("unfreezeAccount восстанавливает работу batchTransfer", async () => {
    await ibiti.connect(founder).batchTransfer([alice.address], [10]);
    await ibiti.connect(founder).freezeAccount(alice.address);
    await expect(
      ibiti.connect(alice).batchTransfer([bob.address], [5])
    ).to.be.reverted;

    await ibiti.connect(founder).unfreezeAccount(alice.address);
    await expect(
      ibiti.connect(alice).batchTransfer([bob.address], [5])
    )
      .to.emit(ibiti, "BatchTransfer")
      .withArgs(alice.address, 5);

    expect(await ibiti.balanceOf(bob.address)).to.equal(5);
  });

  it("pause/unpause блокируют и разрешают batchTransfer", async () => {
    await ibiti.connect(founder).batchTransfer([alice.address], [20]);

    await ibiti.connect(founder).pause();
    await expect(
      ibiti.connect(alice).batchTransfer([bob.address], [5])
    ).to.be.revertedWith("Pausable: paused");

    await ibiti.connect(founder).unpause();
    await expect(
      ibiti.connect(alice).batchTransfer([bob.address], [5])
    )
      .to.emit(ibiti, "BatchTransfer")
      .withArgs(alice.address, 5);

    expect(await ibiti.balanceOf(bob.address)).to.equal(5);
  });

  it("getHoldingDuration отражает время с момента первого прихода токенов", async () => {
    expect(await ibiti.getHoldingDuration(alice.address)).to.equal(0);

    await ibiti.connect(founder).batchTransfer([alice.address], [50]);
    await ethers.provider.send("evm_increaseTime", [15]);
    await ethers.provider.send("evm_mine");

    const dur = await ibiti.getHoldingDuration(alice.address);
    expect(dur).to.be.at.least(15);

    await ibiti.connect(alice).batchTransfer([bob.address], [50]);
    expect(await ibiti.getHoldingDuration(alice.address)).to.equal(0);
  });
});
