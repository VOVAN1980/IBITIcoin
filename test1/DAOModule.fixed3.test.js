const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAOModuleImplementation", function () {
  let deployer, voter, other;
  let token, nft, dao;
  const VOTING_PERIOD = 7 * 24 * 60 * 60; // 7 days
  const TIMELOCK = 24 * 60 * 60; // 1 day

  beforeEach(async () => {
    [deployer, voter, other] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("DAOToken", "DAO", voter.address, ethers.parseUnits("100000", 18));

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();

    const DAO = await ethers.getContractFactory("DAOModuleImplementation");
    dao = await DAO.deploy(token.target, nft.target);

    await token.connect(voter).approve(dao.target, ethers.parseUnits("100000", 18));
    await nft.connect(deployer).setDAOModule(dao.target);
  });

  it("registers voter if balance threshold met", async () => {
    await expect(dao.connect(voter).registerVoter())
      .to.emit(dao, "VoterRegistered")
      .withArgs(voter.address);
  });

  it("rejects register if already registered", async () => {
    await dao.connect(voter).registerVoter();
    await expect(dao.connect(voter).registerVoter()).to.be.revertedWith("Already registered");
  });

  it("allows creating and voting on proposal", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("Test proposal", VOTING_PERIOD);
    await dao.connect(voter).optIn(0);
    await dao.connect(voter).vote(0, true);
    const p = await dao.proposals(0);
    expect(p.description).to.equal("Test proposal");
    expect(p.yesVotes).to.equal(1);
  });

  it("executeProposal respects timelock and quorum", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("Quorum test", VOTING_PERIOD);
    await dao.connect(voter).optIn(0);
    await dao.connect(voter).vote(0, true);
    await ethers.provider.send("evm_increaseTime", [VOTING_PERIOD + TIMELOCK + 1]);
    await ethers.provider.send("evm_mine");
    await expect(dao.connect(voter).executeProposal(0)).to.emit(dao, "ProposalExecuted");
  });

  it("prevents double vote", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("No repeat", VOTING_PERIOD);
    await dao.connect(voter).optIn(0);
    await dao.connect(voter).vote(0, true);
    await expect(dao.connect(voter).vote(0, true)).to.be.revertedWith("Already voted");
  });

  it("fails executeProposal if quorum not met (non-owner)", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("Fail quorum", VOTING_PERIOD);
    await dao.connect(voter).optIn(0);
    await ethers.provider.send("evm_increaseTime", [VOTING_PERIOD + TIMELOCK + 1]);
    await ethers.provider.send("evm_mine");
    await expect(dao.connect(voter).executeProposal(0)).to.be.revertedWith("Quorum not met");
  });

  it("owner can bypass quorum", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("Owner bypass", VOTING_PERIOD);
    await ethers.provider.send("evm_increaseTime", [VOTING_PERIOD + TIMELOCK + 1]);
    await ethers.provider.send("evm_mine");
    await expect(dao.connect(deployer).executeProposal(0)).to.emit(dao, "ProposalExecuted");
  });

  it("awards NFT manually", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("Award NFT", VOTING_PERIOD);
    await dao.awardNFTReward(0, voter.address, 5, "ipfs://manual");
    expect(await nft.tokenURI(0)).to.include("https://dweb.link/ipfs/manual");
  });

  it("fails award if already rewarded", async () => {
    await dao.connect(voter).registerVoter();
    await dao.connect(voter).createProposal("Award NFT", VOTING_PERIOD);
    await dao.awardNFTReward(0, voter.address, 5, "ipfs://manual");
    await expect(
      dao.awardNFTReward(0, voter.address, 5, "ipfs://manual2")
    ).to.be.revertedWith("Rewards already issued for this proposal");
  });

  it("pause blocks critical functions", async () => {
    await dao.pause();
    await expect(dao.createProposal("Blocked", VOTING_PERIOD)).to.be.revertedWith("Pausable: paused");
  });
});