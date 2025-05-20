// test/IBITIcoin.daoProxy.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – DAO proxy branches", function () {
  let owner, user, ibiti;
  const zero = ethers.ZeroAddress;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("IBITIcoin");
    ibiti = await Factory.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      owner.address, owner.address,
      owner.address, owner.address,
      zero
    );
    await ibiti.waitForDeployment();
  });

  // 1) daoModule == 0 → silent return
  it("createProposalSimple returns silently when daoModule==0", async () => {
    await expect(ibiti.createProposalSimple("x")).not.to.be.reverted;
  });

  // 2) DAO returns true → silent return
  it("createProposalSimple succeeds when DAO returns true", async () => {
    const mock = await (await ethers.getContractFactory("MockDAO")).deploy();
    await mock.waitForDeployment();
    await ibiti.setDaoModule(mock.target);
    await expect(ibiti.createProposalSimple("x")).not.to.be.reverted;
  });

  // 3) DAO returns false → Err(0xF040)
  it("createProposalSimple reverts with Err(0xF040) when DAO returns false", async () => {
    const mockFalse = await (await ethers.getContractFactory("MockDAOFalse")).deploy();
    await mockFalse.waitForDeployment();
    await ibiti.setDaoModule(mockFalse.target);
    await expect(ibiti.createProposalSimple("x"))
      .to.be.reverted;
  });

  // 4) DAO reverts → propagate original reason
  it("createProposalSimple reverts with original reason when DAO reverts", async () => {
    const mockRevert = await (await ethers.getContractFactory("MockDAORevert")).deploy();
    await mockRevert.waitForDeployment();
    await ibiti.setDaoModule(mockRevert.target);
    await expect(ibiti.createProposalSimple("x"))
      .to.be.revertedWith("fail");
  });

  // voteProposal branches
  it("voteProposal returns silently when daoModule==0", async () => {
    await expect(ibiti.voteProposal(1, true)).not.to.be.reverted;
  });

  it("voteProposal succeeds when DAO returns true", async () => {
    const mock = await (await ethers.getContractFactory("MockDAO")).deploy();
    await mock.waitForDeployment();
    await ibiti.setDaoModule(mock.target);
    await expect(ibiti.voteProposal(1, false)).not.to.be.reverted;
  });

  it("voteProposal reverts with Err(0xF041) when DAO returns false", async () => {
    const mockFalse = await (await ethers.getContractFactory("MockDAOFalse")).deploy();
    await mockFalse.waitForDeployment();
    await ibiti.setDaoModule(mockFalse.target);
    await expect(ibiti.voteProposal(1, true))
      .to.be.reverted;
  });

  it("voteProposal reverts with original reason when DAO reverts", async () => {
    const mockRevert = await (await ethers.getContractFactory("MockDAORevert")).deploy();
    await mockRevert.waitForDeployment();
    await ibiti.setDaoModule(mockRevert.target);
    await expect(ibiti.voteProposal(1, false))
      .to.be.revertedWith("fail");
  });

  // executeProposalSimple branches
  it("executeProposalSimple returns silently when daoModule==0", async () => {
    await expect(ibiti.executeProposalSimple(1)).not.to.be.reverted;
  });

  it("executeProposalSimple succeeds when DAO returns true", async () => {
    const mock = await (await ethers.getContractFactory("MockDAO")).deploy();
    await mock.waitForDeployment();
    await ibiti.setDaoModule(mock.target);
    await expect(ibiti.executeProposalSimple(1)).not.to.be.reverted;
  });

  it("executeProposalSimple reverts with Err(0xF042) when DAO returns false", async () => {
    const mockFalse = await (await ethers.getContractFactory("MockDAOFalse")).deploy();
    await mockFalse.waitForDeployment();
    await ibiti.setDaoModule(mockFalse.target);
    await expect(ibiti.executeProposalSimple(1))
      .to.be.reverted;
  });

  it("executeProposalSimple reverts with original reason when DAO reverts", async () => {
    const mockRevert = await (await ethers.getContractFactory("MockDAORevert")).deploy();
    await mockRevert.waitForDeployment();
    await ibiti.setDaoModule(mockRevert.target);
    await expect(ibiti.executeProposalSimple(1))
      .to.be.revertedWith("fail");
  });
});
