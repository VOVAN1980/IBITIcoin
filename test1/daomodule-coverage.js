const { expect } = require("chai");
const { ethers } = require("hardhat");

// Full coverage tests for DAOModuleImplementation and NFTDiscount integration
// Scenarios: registration, proposal creation, opt-in/vote logic, execution (quorum/timelock), auto/manual NFT rewards, admin setters, pause/unpause.

describe("DAOModule Full Coverage", function () {
  let token, nftDiscount, dao;
  let owner, u1, u2, outsider;

  // Threshold and time constants
  const VOTE_THRESHOLD_NAT = 100n;
  const DECIMALS = 8;
  const ONE_DAY = 24 * 3600;

  beforeEach(async function () {
    [owner, u1, u2, outsider] = await ethers.getSigners();

    // Deploy mock ERC20 with decimals and ample supply
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const thresholdUnits = ethers.parseUnits(VOTE_THRESHOLD_NAT.toString(), DECIMALS);
    const initialSupply = thresholdUnits * 5n;
    token = await ERC20Mock.deploy("TKN", "TKN", owner.address, initialSupply);
    await token.waitForDeployment();

    // Distribute threshold tokens
    await token.transfer(u1.address, thresholdUnits);
    await token.transfer(u2.address, thresholdUnits);

    // Deploy NFTDiscount and configure DAO module
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy DAOModuleImplementation
    const DAOModuleImpl = await ethers.getContractFactory("DAOModuleImplementation");
    dao = await DAOModuleImpl.deploy(token.target, nftDiscount.target);
    await dao.waitForDeployment();

    // Allow DAO module to mint rewards
    await nftDiscount.connect(owner).setDAOModule(dao.target);
  });

  it("createProposalSimple: rejects outsider and unregistered, then allows after registration", async function () {
    // Outsider: no tokens
    await expect(
      dao.connect(outsider).createProposalSimple("P")
    ).to.be.revertedWith("Need threshold tokens");

    // u1 has tokens but not registered
    await expect(
      dao.connect(u1).createProposalSimple("P")
    ).to.be.revertedWith("Not registered");

    // Register and retry
    await expect(dao.connect(u1).registerVoter())
      .to.emit(dao, "VoterRegistered").withArgs(u1.address);
    await expect(dao.connect(u1).createProposalSimple("P"))
      .to.emit(dao, "ProposalCreated");
  });

  it("optIn + vote: only once, blocked post endTime", async function () {
    // Register both
    await dao.connect(u1).registerVoter();
    await dao.connect(u2).registerVoter();

    // Create proposal
    await dao.connect(u1).createProposalSimple("VoteTest");
    const pid = 0;

    // Cannot vote before opt-in
    await expect(
      dao.connect(u1).vote(pid, true)
    ).to.be.revertedWith("Must opt-in first");

    // Opt-in sequence
    await expect(dao.connect(u1).optIn(pid))
      .to.emit(dao, "OptedIn").withArgs(pid, u1.address);
    await expect(dao.connect(u2).optIn(pid))
      .to.emit(dao, "OptedIn").withArgs(pid, u2.address);

    // First vote OK
    await expect(dao.connect(u1).vote(pid, true))
      .to.emit(dao, "Voted").withArgs(pid, u1.address, true);

    // Second vote rejected
    await expect(
      dao.connect(u1).vote(pid, false)
    ).to.be.revertedWith("Already voted");

    // Advance past voting window
    await ethers.provider.send("evm_increaseTime", [ONE_DAY + 1]);
    await ethers.provider.send("evm_mine");

    await expect(
      dao.connect(u2).vote(pid, true)
    ).to.be.revertedWith("Voting ended");
  });

  it("executeProposal: rejects insufficient quorum and premature timelock", async function () {
    // Register and create
    await dao.connect(u1).registerVoter();
    await dao.connect(u2).registerVoter();
    await dao.connect(u1).createProposalSimple("ExecTest");
    const pid = 0;

    // Both opt-in
    await dao.connect(u1).optIn(pid);
    await dao.connect(u2).optIn(pid);

    // Single vote -> no quorum
    await dao.connect(u1).vote(pid, true);
    await ethers.provider.send("evm_increaseTime", [2 * ONE_DAY + 1]);
    await ethers.provider.send("evm_mine");

    await expect(
      dao.connect(u1).executeProposal(pid)
    ).to.be.revertedWith("Quorum not met");

    // New proposal with full support
    await dao.connect(u1).createProposalSimple("ExecTest2");
    const pid2 = 1;
    await dao.connect(u1).optIn(pid2);
    await dao.connect(u2).optIn(pid2);
    await dao.connect(u1).vote(pid2, true);
    await dao.connect(u2).vote(pid2, true);

    // Advance only vote period, not timelock
    await ethers.provider.send("evm_increaseTime", [ONE_DAY + 1]);
    await ethers.provider.send("evm_mine");

    await expect(
      dao.executeProposal(pid2)
    ).to.be.revertedWith("Timelock not expired");
  });

  it("executeProposal: succeeds after timelock and issues correct NFT count", async function () {
    // Register and support a proposal
    await dao.connect(u1).registerVoter();
    await dao.connect(u2).registerVoter();
    await dao.connect(u1).createProposalSimple("Good");
    const pid = 0;
    await dao.connect(u1).optIn(pid);
    await dao.connect(u2).optIn(pid);
    await dao.connect(u1).vote(pid, true);
    await dao.connect(u2).vote(pid, true);

    // Advance past voting + timelock
    await ethers.provider.send("evm_increaseTime", [2 * ONE_DAY + 1]);
    await ethers.provider.send("evm_mine");

    // Expect two winners -> 4 Jackpot NFTs minted
    await expect(dao.connect(u1).executeProposal(pid))
      .to.emit(dao, "ProposalExecuted").withArgs(pid, true);
    expect(await nftDiscount.nextTokenId()).to.equal(4n);
  });

  it("awardNFTReward: manual award works once, duplicates blocked", async function () {
    await dao.connect(u1).registerVoter();
    await dao.connect(u1).createProposalSimple("Manual");
    const pid = 0;

    // Manual award without opt-in/vote
    await expect(
      dao.awardNFTReward(pid, u2.address, 10, "uri")
    ).to.emit(dao, "NFTRewardAwarded").withArgs(u2.address, 10, "uri");

    // Second manual award fails
    await expect(
      dao.awardNFTReward(pid, u1.address, 5, "uri2")
    ).to.be.revertedWith("Rewards already issued for this proposal");
  });

  it("admin setters, pause and unpause behavior", async function () {
    // Voting timelock update
    await expect(dao.setVotingTimelock(123))
      .to.emit(dao, "VotingTimelockUpdated").withArgs(123);

    // Update base URI
    await expect(dao.setVotingRewardBaseURI("newURI"))
      .to.emit(dao, "VotingRewardBaseURIUpdated").withArgs("newURI");

    // Pause prevents actions
    await dao.pause();
    await expect(dao.createProposalSimple("X")).to.be.revertedWith("Pausable: paused");

    // Unpause restores
    await dao.unpause();
    await dao.connect(u1).registerVoter();
  });
});
