const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule — extra coverage", function () {
  let token, nftDiscount, staking;
  let owner, user, treasury;
  let tokenSigner;

  beforeEach(async function () {
    [owner, user, treasury] = await ethers.getSigners();

    // Deploy mock token and mint to owner
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("Mock Token", "MTK", owner.address, ethers.parseUnits("1000000", 8));
    await token.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // Deploy StakingModule
    const StakingModule = await ethers.getContractFactory("StakingModule");
    staking = await StakingModule.deploy(token.target, nftDiscount.target);
    await staking.waitForDeployment();

    // Set treasury
    await staking.connect(owner).setTreasury(treasury.address);

    // Impersonate token contract address for staking calls
    await ethers.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund impersonated account for gas
    await ethers.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

    // Approve staking contract to spend owner's tokens
    await token.connect(owner).approve(staking.target, ethers.MaxUint256);

    // Initial stake so tests of unstake can proceed (owner)
    await staking.connect(tokenSigner).stakeTokensFor(owner.address, ethers.parseUnits("100", 8), 1);
  });

  afterEach(async function () {
    // Stop impersonating
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  describe("Pause / Unpause", function () {
    it("pause blocks stake and unstake", async function () {
      // Pause
      await staking.connect(owner).pause();

      // Attempt to stake
      await expect(
        staking.connect(tokenSigner).stakeTokensFor(owner.address, ethers.parseUnits("10", 8), 1)
      ).to.be.revertedWith("Pausable: paused");

      // Attempt to unstake
      await expect(
        staking.connect(tokenSigner).unstakeTokensFor(owner.address, 0)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("unpause restores stake and unstake", async function () {
      // Pause and then unpause
      await staking.connect(owner).pause();
      await staking.connect(owner).unpause();

      // Stake should work again (owner)
      await expect(
        staking.connect(tokenSigner).stakeTokensFor(owner.address, ethers.parseUnits("10", 8), 1)
      ).to.emit(staking, "Staked");

      // Fast-forward for unstake
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ethers.provider.send("evm_mine");

      // Provide reward funds
      const rewardAmount = ethers.parseUnits("1", 8);
      await token.connect(owner).transfer(staking.target, rewardAmount);

      // Unstake should work (first index 0 still present: initial stake, then new stake index 1)
      await expect(
        staking.connect(tokenSigner).unstakeTokensFor(owner.address, 1)
      ).to.emit(staking, "Unstaked");
    });
  });
});
