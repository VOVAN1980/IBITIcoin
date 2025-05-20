const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAOModuleIntegration", function () {
  let token;
  let nftDiscount;
  let dao;
  let owner, alice, bob, carol;
  let VOTE_THRESHOLD, minVotingPeriod, votingTimelock;

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // Deploy a mock ERC20 with 8 decimals
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TestToken",
      "TTK",
      owner.address,
      ethers.parseUnits("1000000", 8)
    );
    await token.waitForDeployment();

    // Deploy NFTDiscount and assign DAO module
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy DAOModuleImplementation
    const DAOModuleImpl = await ethers.getContractFactory("DAOModuleImplementation");
    dao = await DAOModuleImpl.deploy(token.target, nftDiscount.target);
    await dao.waitForDeployment();

    // Allow DAO to mint through NFTDiscount
    await nftDiscount.connect(owner).setDAOModule(dao.target);

    // Fetch constants
    VOTE_THRESHOLD   = await dao.VOTE_THRESHOLD();
    minVotingPeriod  = await dao.minVotingPeriod();
    votingTimelock   = await dao.votingTimelock();

    // Distribute threshold tokens to alice and bob
    const thresholdUnits = ethers.parseUnits("100", 8);
    await token.transfer(alice.address, thresholdUnits);
    await token.transfer(bob.address,   thresholdUnits);
  });

  it("allows token holders to register, propose, opt-in, vote, execute and receive NFT rewards", async function () {
    // Registration
    await expect(dao.connect(alice).registerVoter())
      .to.emit(dao, "VoterRegistered")
      .withArgs(alice.address);
    await expect(dao.connect(bob).registerVoter())
      .to.emit(dao, "VoterRegistered")
      .withArgs(bob.address);

    // Create proposal (simple uses minVotingPeriod)
    await expect(dao.connect(alice).createProposalSimple("Test Proposal"))
      .to.emit(dao, "ProposalCreated");

    // Opt-in
    await expect(dao.connect(alice).optIn(0))
      .to.emit(dao, "OptedIn").withArgs(0, alice.address);
    await expect(dao.connect(bob).optIn(0))
      .to.emit(dao, "OptedIn").withArgs(0, bob.address);

    // Voting
    await expect(dao.connect(alice).vote(0, true))
      .to.emit(dao, "Voted").withArgs(0, alice.address, true);
    await expect(dao.connect(bob).vote(0, false))
      .to.emit(dao, "Voted").withArgs(0, bob.address, false);

    // Advance time past voting + timelock
    const advance = Number(minVotingPeriod) + Number(votingTimelock) + 1;
    await ethers.provider.send("evm_increaseTime", [advance]);
    await ethers.provider.send("evm_mine");

    // Execute as a voter (not owner) to trigger rewards
    await expect(dao.connect(alice).executeProposal(0))
      .to.emit(dao, "ProposalExecuted");

    // Check that rewardsIssued flag is set
    const proposal = await dao.proposals(0);
    expect(proposal.rewardsIssued).to.equal(true);

    // Manual award after auto should revert
    await expect(
      dao.connect(owner).awardNFTReward(0, carol.address, 5, "ipfs://newRewardURI")
    ).to.be.revertedWith("Rewards already issued for this proposal");
  });

  it("rejects registration for non-threshold holders", async function () {
    await expect(dao.connect(carol).registerVoter())
      .to.be.revertedWith("Need threshold tokens");
  });
});
