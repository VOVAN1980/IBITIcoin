const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Helper to fast-forward time
async function warp(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("NFTDiscount – missing functionality tests", function () {
  let nft;
  let owner, dao, staking, operator, alice, bob;
  const DAY = 24 * 3600;
  const MONTH = 30 * DAY;

  before(async () => {
    [owner, dao, staking, operator, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("NFTDiscount");
    nft = await Factory.deploy();
    await nft.waitForDeployment();

    // Setup roles
    await nft.setDAOModule(dao.address);
    await nft.setDiscountOperator(operator.address);
  });

  it("should allow owner to set stakingModule and authorize it for jackpot minting", async function () {
    // Only owner can set
    await expect(nft.connect(alice).setStakingModule(staking.address))
      .to.be.revertedWith("Ownable: caller is not the owner");

    // Owner sets
    await expect(nft.connect(owner).setStakingModule(staking.address))
      .to.emit(nft, "StakingModuleSet")
      .withArgs(staking.address);

    // staking module can mintJackpot
    const uri = "ipfs://jack1";
    await expect(nft.connect(staking).mintJackpot(bob.address, 20, uri))
      .to.emit(nft, "NFTMintedJackpot")
      .withArgs(bob.address, 0, 20);

    // unauthorized cannot mintJackpot
    await expect(
      nft.connect(alice).mintJackpot(bob.address, 20, "ipfs://fail")
    ).to.be.revertedWith("Not authorized for Jackpot mint");
  });

  it("should allow discountOperator to usePandoraFor and enforce pause state", async function () {
    // Mint Pandora NFT to Alice
    await nft.connect(owner).mintPandora(alice.address, "puri");
    const pid = 0;

    // usePandoraFor by operator
    await expect(nft.connect(operator).usePandoraFor(alice.address, pid))
      .to.emit(nft, "NFTUsed")
      .withArgs(alice.address, pid, 100);

    // Pause contract
    await nft.connect(owner).pause();
    await expect(nft.connect(operator).usePandoraFor(alice.address, pid))
      .to.be.revertedWith("Contract is paused");
    await expect(nft.connect(owner).mint(alice.address, 1, "uriX"))
      .to.be.revertedWith("Contract is paused");

    // Unpause
    await nft.connect(owner).unpause();
    await expect(nft.connect(operator).usePandoraFor(alice.address, pid))
      .to.emit(nft, "NFTUsed");
  });

  it("should enforce monthly transfer limit and reset after 30 days", async function () {
    // Mint three Normal NFTs to Alice
    for (let i = 0; i < 3; i++) {
      await nft.connect(owner).mint(alice.address, 1, `ipfs://t${i}`);
    }

    // Set monthly transfer limit for recipients (Normal level = 0)
    await nft.setMonthlyLimit(0, 2);

    // Two transfers: token 0 and 1
    await nft.connect(alice).transferFrom(alice.address, bob.address, 0);
    await nft.connect(alice).transferFrom(alice.address, bob.address, 1);

    // Third transfer should revert (limit reached)
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 2)
    ).to.be.revertedWith("Monthly transfer limit");

    // Warp past reset period
    await warp(MONTH + DAY);

    // Mint a fresh NFT for clear test
    await nft.connect(owner).mint(alice.address, 1, "ipfs://new");
    const newId = 3;

    // Now transferring new NFT should succeed
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, newId)
    ).to.not.be.reverted;
    expect(await nft.ownerOf(newId)).to.equal(bob.address);
  });

  it("should revert operations when paused and resume after unpause", async function () {
    // Pause
    await nft.connect(owner).pause();

    // Mint should revert with custom message
    await expect(
      nft.connect(owner).mint(alice.address, 1, "ipfs://p1")
    ).to.be.revertedWith("Contract is paused");

    // Transfer should revert
    await nft.connect(owner).unpause();
    await nft.connect(owner).mint(alice.address, 1, "ipfs://p1");
    await nft.connect(owner).pause();
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 0)
    ).to.be.revertedWith("Contract is paused");

    // useDiscount should revert with custom message
    await expect(
      nft.connect(alice).useDiscount(0)
    ).to.be.revertedWith("Contract is paused");

    // Unpause and operations succeed
    await nft.connect(owner).unpause();
    await expect(nft.connect(alice).useDiscount(0)).to.emit(nft, "NFTUsed");
  });
});
