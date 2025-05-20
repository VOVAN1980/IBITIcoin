const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuybackManager.setPath", function () {
  let owner, alice;
  let paymentToken, ibiti, bMgr;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    // Deploy mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    paymentToken = await ERC20Mock.deploy("Payment", "PAY");
    await paymentToken.waitForDeployment();
    ibiti = await ERC20Mock.deploy("IBITI", "IBI");
    await ibiti.waitForDeployment();

    // Deploy BuybackManager with a valid initial path [PAY, IBI]
    const BBM = await ethers.getContractFactory("BuybackManager");
    bMgr = await BBM.deploy(
      ibiti.target,
      paymentToken.target,
      owner.address,                   // router (dummy, non-zero)
      [paymentToken.target, ibiti.target],
      owner.address,                   // burnAddress
      50                               // initialBurnPercent
    );
    await bMgr.waitForDeployment();
  });

  it("allows owner to set a valid path", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const t1 = await ERC20Mock.deploy("Token1", "T1");
    await t1.waitForDeployment();
    const newPath = [paymentToken.target, t1.target, ibiti.target];

    await expect(bMgr.setPath(newPath))
      .to.emit(bMgr, "PathUpdated")
      .withArgs(newPath);

    // Confirm storage updated
    expect(await bMgr.path(0)).to.equal(paymentToken.target);
    expect(await bMgr.path(1)).to.equal(t1.target);
    expect(await bMgr.path(2)).to.equal(ibiti.target);
  });

  it("reverts when called by non-owner", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const t1 = await ERC20Mock.deploy("Token1", "T1");
    await t1.waitForDeployment();

    const newPath = [paymentToken.target, t1.target, ibiti.target];
    await expect(bMgr.connect(alice).setPath(newPath))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("reverts when paused", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const t1 = await ERC20Mock.deploy("Token1", "T1");
    await t1.waitForDeployment();

    const newPath = [paymentToken.target, t1.target, ibiti.target];
    await bMgr.pause();
    await expect(bMgr.setPath(newPath))
      .to.be.revertedWith("Pausable: paused");
  });

  it("reverts for length < 2", async function () {
    await expect(bMgr.setPath([paymentToken.target]))
      .to.be.revertedWith("BM: path length out of range");
  });

  it("reverts for length > MAX_PATH_LENGTH", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    // create 4 intermediate tokens, so total length = 1 + 4 + 1 = 6 (>5)
    const tks = [];
    for (let i = 0; i < 4; i++) {
      const tk = await ERC20Mock.deploy(`TK${i}`, `TK${i}`);
      await tk.waitForDeployment();
      tks.push(tk.target);
    }
    const longPath = [paymentToken.target, ...tks, ibiti.target]; // length = 6
    await expect(bMgr.setPath(longPath))
      .to.be.revertedWith("BM: path length out of range");
  });

  it("reverts if path start is wrong", async function () {
    await expect(bMgr.setPath([alice.address, ibiti.target]))
      .to.be.revertedWith("BM: wrong path start");
  });

  it("reverts if path end is wrong", async function () {
    await expect(bMgr.setPath([paymentToken.target, alice.address]))
      .to.be.revertedWith("BM: wrong path end");
  });

  it("reverts on zero address in path", async function () {
    await expect(bMgr.setPath([paymentToken.target, ethers.ZeroAddress, ibiti.target]))
      .to.be.revertedWith("BM: zero address in path");
  });

  it("reverts on duplicate neighbor segments", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const t1 = await ERC20Mock.deploy("Token1", "T1");
    await t1.waitForDeployment();

    // direct duplicate: [PAY, T1, T1, IBI]
    const dupNeighbor = [paymentToken.target, t1.target, t1.target, ibiti.target];
    await expect(bMgr.setPath(dupNeighbor))
      .to.be.revertedWith("BM: duplicate path segment");
  });

  it("reverts on simple A→B→A loop", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const t1 = await ERC20Mock.deploy("Token1", "T1");
    await t1.waitForDeployment();

    // invalid loop: [PAY, T1, PAY, IBI]
    const loopPath = [paymentToken.target, t1.target, paymentToken.target, ibiti.target];
    await expect(bMgr.setPath(loopPath))
      .to.be.revertedWith("BM: invalid loop in path");
  });

  it("reverts on any duplicate address in path", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20MintableMock");
    const t1 = await ERC20Mock.deploy("Token1", "T1");
    const t2 = await ERC20Mock.deploy("Token2", "T2");
    await t1.waitForDeployment();
    await t2.waitForDeployment();

    // duplicate T1 appears twice non-neighbor: [PAY, T1, T2, T1, IBI]
    const dupAnywhere = [paymentToken.target, t1.target, t2.target, t1.target, ibiti.target];
    await expect(bMgr.setPath(dupAnywhere))
      .to.be.revertedWith("BM: invalid loop in path");
  });
});
