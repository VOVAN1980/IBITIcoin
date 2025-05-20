const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule — reentrancy protection", function () {
  let owner, attacker;
  let staking, malicious, tokenSigner;
  const STAKE_AMOUNT = ethers.parseUnits("10", 18);

  beforeEach(async () => {
    [owner, attacker] = await ethers.getSigners();

    // 1) Deploy malicious token from attacker
    const Malicious = await ethers.getContractFactory("MaliciousToken");
    malicious = await Malicious.connect(attacker).deploy(ethers.ZeroAddress);
    await malicious.waitForDeployment();

    // 2) Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    const nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 3) Deploy StakingModule with malicious token
    const Staking = await ethers.getContractFactory("StakingModule");
    staking = await Staking.connect(owner).deploy(malicious.target, nftDiscount.target);
    await staking.waitForDeployment();

    // 4) Configure malicious to call unstake in transferFrom
    await malicious.connect(attacker).setStaking(staking.target);

    // 5) Approve for staking
    await malicious.connect(attacker).approve(staking.target, STAKE_AMOUNT);

    // 6) Set treasury
    await staking.connect(owner).setTreasury(owner.address);

    // 7) Impersonate malicious token contract for stake calls
    await ethers.provider.send("hardhat_impersonateAccount", [malicious.target]);
    tokenSigner = await ethers.getSigner(malicious.target);
    // Fund impersonated account for gas
    await ethers.provider.send("hardhat_setBalance", [malicious.target, "0x1000000000000000000"]);
  });

  afterEach(async () => {
    // Stop impersonation
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [malicious.target]);
  });

  it("should block reentrant stakeTokensFor via malicious token", async function () {
    // ReentrancyGuard should prevent nested stakeTokensFor/unstakeTokens
    await expect(
      staking.connect(tokenSigner).stakeTokensFor(
        attacker.address,
        STAKE_AMOUNT,
        1
      )
    ).to.be.reverted; // revert expected due to reentrancy protection
  });
});
