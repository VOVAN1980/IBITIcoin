const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAOModule – branch coverage for corner cases", function() {
  let token, nftDiscount, dao;
  let owner, alice, bob;
  let minVotingPeriod, maxVotingPeriod, votingTimelock;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TKN", "TKN", owner.address,
      ethers.parseUnits("1000", 8)
    );
    await token.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy DAOModuleImplementation
    const DAOModuleImpl = await ethers.getContractFactory("DAOModuleImplementation");
    dao = await DAOModuleImpl.deploy(token.target, nftDiscount.target);
    await dao.waitForDeployment();

    // Allow DAO to mint via NFTDiscount
    await nftDiscount.connect(owner).setDAOModule(dao.target);

    // Fetch periods
    minVotingPeriod = Number(await dao.minVotingPeriod());
    maxVotingPeriod = Number(await dao.maxVotingPeriod());
    votingTimelock = Number(await dao.votingTimelock());
  });

  it("createProposal rejects invalid votingPeriod", async function() {
    // Below min
    await expect(
      dao.createProposal("bad", minVotingPeriod - 1)
    ).to.be.revertedWith("Invalid voting period");
    // Above max
    await expect(
      dao.createProposal("bad2", maxVotingPeriod + 1)
    ).to.be.revertedWith("Invalid voting period");
    // Boundaries OK
    await expect(
      dao.createProposal("ok1", minVotingPeriod)
    ).to.emit(dao, "ProposalCreated");
    await expect(
      dao.createProposal("ok2", maxVotingPeriod)
    ).to.emit(dao, "ProposalCreated");
  });

  it("owner can executeProposal without quorum and no auto-rewards", async function() {
    // Create proposal by owner
    await dao.createProposalSimple("ownerExec");
    const pid = 0;
    // Fast-forward
    await ethers.provider.send("evm_increaseTime", [minVotingPeriod + votingTimelock + 1]);
    await ethers.provider.send("evm_mine");

    const beforeId = await nftDiscount.nextTokenId();
    await expect(
      dao.connect(owner).executeProposal(pid)
    ).to.emit(dao, "ProposalExecuted").withArgs(pid, false);
    const afterId = await nftDiscount.nextTokenId();
    expect(afterId).to.equal(beforeId);
  });

  it("executeProposal cannot be called twice", async function() {
    await dao.createProposalSimple("singleExec");
    const pid = 0;
    await ethers.provider.send("evm_increaseTime", [minVotingPeriod + votingTimelock + 1]);
    await ethers.provider.send("evm_mine");
    await dao.connect(owner).executeProposal(pid);
    await expect(
      dao.connect(owner).executeProposal(pid)
    ).to.be.revertedWith("Already executed");
  });

  it("awardNFTReward invalid proposalId and onlyOwner enforcement", async function() {
    // Invalid id
    await expect(
      dao.awardNFTReward(99, owner.address, 1, "uri")
    ).to.be.revertedWith("Invalid proposalId");
    // Non-owner
    await dao.createProposalSimple("awardTest");
    await expect(
      dao.connect(alice).awardNFTReward(0, alice.address, 1, "uri")
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("manual award emits only NFTRewardAwarded, not NFTRewardsIssued", async function() {
    await dao.createProposalSimple("manualOnly");
    await expect(
      dao.awardNFTReward(0, alice.address, 3, "manualURI")
    )
      .to.emit(dao, "NFTRewardAwarded").withArgs(alice.address, 3, "manualURI")
      .and.not.to.emit(dao, "NFTRewardsIssued");
  });

  it("owner bypasses onlyEligibleVoter for optIn and vote", async function() {
    // Setup: Alice registers and creates
    await token.transfer(alice.address, ethers.parseUnits("100", 8));
    await dao.connect(alice).registerVoter();
    await dao.connect(alice).createProposalSimple("bypassTest");
    // Owner opt-in/vote with no tokens
    await expect(
      dao.optIn(0)
    ).to.emit(dao, "OptedIn").withArgs(0, owner.address);
    await expect(
      dao.vote(0, true)
    ).to.emit(dao, "Voted").withArgs(0, owner.address, true);
  });

  it("voteProposal proxies correctly and getProposalCount works", async function() {
    // Initially zero
    expect(await dao.getProposalCount()).to.equal(0);
    // Create one
    await dao.createProposalSimple("CountTest");
    expect(await dao.getProposalCount()).to.equal(1);

    // Transfer & register Alice
    await token.transfer(alice.address, ethers.parseUnits("100", 8));
    await dao.connect(alice).registerVoter();
    await dao.connect(alice).optIn(0);

    // Vote via voteProposal
    await expect(
      dao.connect(alice).voteProposal(0, true)
    )
      .to.emit(dao, "Voted").withArgs(0, alice.address, true);
  });
});
