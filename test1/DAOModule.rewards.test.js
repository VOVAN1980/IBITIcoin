const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits } = ethers;

describe("DAOModule – manual award duplicate protection", function () {
  let token, nftDiscount, dao;
  let owner, other;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy mock ERC20 for voting threshold (decimals = 8)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TST", "TST",
      owner.address,
      parseUnits("1000", 8)
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

    // Allow DAO module to mint via NFTDiscount
    await nftDiscount.connect(owner).setDAOModule(dao.target);

    // Distribute tokens and register voters
    await token.transfer(other.address, parseUnits("200", 8));
    await dao.registerVoter();                // owner
    await dao.connect(other).registerVoter(); // other

    // Create simple proposal
    await dao.createProposalSimple("foobar");
  });

  it("allows only one manual award per proposal", async function () {
    // First manual award succeeds
    await expect(
      dao.awardNFTReward(0, other.address, 5, "uri1")
    ).to.emit(dao, "NFTRewardAwarded").withArgs(other.address, 5, "uri1");

    // Second manual award should be reverted
    await expect(
      dao.awardNFTReward(0, other.address, 7, "uri2")
    ).to.be.revertedWith("Rewards already issued for this proposal");
  });
});
