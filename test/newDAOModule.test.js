const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("New DAO Module Tests (manual optIn)", function () {
  let token, nftDiscount, dao;
  let owner, alice, bob, carol;
  let VOTE_THRESHOLD, minVotingPeriod, votingTimelock;

  const initialSupply = ethers.parseUnits("1000000", 8);

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // Deploy ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("MockToken", "MTK", owner.address, initialSupply);
    await token.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy TestDAOModule (реализация DAO)
    const TestDAOModule = await ethers.getContractFactory("TestDAOModule");
    dao = await TestDAOModule.deploy(token.target, nftDiscount.target);
    await dao.waitForDeployment();

    // Allow DAO module to mint via NFTDiscount
    await nftDiscount.connect(owner).setDAOModule(dao.target);

    // DAO parameters
    VOTE_THRESHOLD   = await dao.VOTE_THRESHOLD();
    minVotingPeriod  = await dao.minVotingPeriod();
    votingTimelock   = await dao.votingTimelock();

    // Distribute threshold tokens: alice & bob; carol none
    const thresholdUnits = ethers.parseUnits("100", 8);
    await token.transfer(alice.address, thresholdUnits);
    await token.transfer(bob.address,   thresholdUnits);
  });

  it("should allow eligible token holders to register, opt-in, vote, and execute with NFT rewards", async function () {
    // Registration
    await expect(dao.connect(alice).registerVoter())
      .to.emit(dao, "VoterRegistered").withArgs(alice.address);
    await expect(dao.connect(bob).registerVoter())
      .to.emit(dao, "VoterRegistered").withArgs(bob.address);

    // Create proposal
    await expect(dao.connect(alice).createProposalSimple("Increase Supply"))
      .to.emit(dao, "ProposalCreated");

    // Voting before opt-in should fail
    await expect(dao.connect(alice).vote(0, true))
      .to.be.revertedWith("Must opt-in first");

    // Manual opt-in
    await expect(dao.connect(alice).optIn(0))
      .to.emit(dao, "OptedIn").withArgs(0, alice.address);
    await expect(dao.connect(bob).optIn(0))
      .to.emit(dao, "OptedIn").withArgs(0, bob.address);

    // Duplicate opt-in blocked
    await expect(dao.connect(alice).optIn(0))
      .to.be.revertedWith("Already opted in");

    // Voting
    await expect(dao.connect(alice).vote(0, true))
      .to.emit(dao, "Voted").withArgs(0, alice.address, true);
    await expect(dao.connect(bob).vote(0, false))
      .to.emit(dao, "Voted").withArgs(0, bob.address, false);

    // Duplicate vote blocked
    await expect(dao.connect(alice).vote(0, false))
      .to.be.revertedWith("Already voted");

    // Advance time past voting + timelock
    const deltaTime = Number(minVotingPeriod) + Number(votingTimelock) + 1;
    await ethers.provider.send("evm_increaseTime", [deltaTime]);
    await ethers.provider.send("evm_mine", []);

    // Execute proposal as a voter (alice)
    await expect(dao.connect(alice).executeProposal(0))
      .to.emit(dao, "ProposalExecuted");

    // Check rewardsIssued flag
    const p = await dao.proposals(0);
    expect(p.rewardsIssued).to.equal(true);

    // Manual award blocked after auto-issue
    await expect(
      dao.connect(owner).awardNFTReward(0, carol.address, 5, "ipfs://rewardCID")
    ).to.be.revertedWith("Rewards already issued for this proposal");
  });

  it("should prevent unqualified users from registering", async function () {
    await expect(dao.connect(carol).registerVoter())
      .to.be.revertedWith("Need threshold tokens");
  });

  it("should prevent opt-in and vote after voting ended", async function () {
    // Registration & create
    await dao.connect(alice).registerVoter();
    await dao.connect(alice).createProposalSimple("Test");

    // Advance beyond voting period
    await ethers.provider.send("evm_increaseTime", [Number(minVotingPeriod) + 1]);
    await ethers.provider.send("evm_mine", []);

    // opt-in & vote should fail after end
    await expect(dao.connect(alice).optIn(0))
      .to.be.revertedWith("Voting ended");
    await expect(dao.connect(alice).vote(0, true))
      .to.be.revertedWith("Voting ended");
  });
});
