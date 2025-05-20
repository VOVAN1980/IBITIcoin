const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Размер стейка
const STAKE_AMOUNT = ethers.parseUnits("100", 8);

describe("StakingModule - Admin and Pause", function () {
  let stakingModule, token, nftDiscount;
  let owner, user, treasury;
  let tokenSigner;

  beforeEach(async function () {
    [owner, user, treasury] = await ethers.getSigners();

    // 1) Deploy ERC20Mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TestToken",
      "TT",
      owner.address,
      ethers.parseUnits("10000000", 8)
    );
    await token.waitForDeployment();

    // 2) Distribute tokens
    await token.transfer(user.address, ethers.parseUnits("1000", 8));
    await token.transfer(treasury.address, ethers.parseUnits("1000", 8));

    // 3) Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 4) Deploy StakingModule
    const StakingModule = await ethers.getContractFactory("StakingModule");
    stakingModule = await StakingModule.deploy(token.target, nftDiscount.target);
    await stakingModule.waitForDeployment();

    // 5) Configure NFTDiscount DAO module
    await nftDiscount.connect(owner).setDAOModule(stakingModule.target);

    // 6) Set treasury and approve treasury
    await stakingModule.connect(owner).setTreasury(treasury.address);
    await token.connect(treasury).approve(
      stakingModule.target,
      ethers.parseUnits("1000", 8)
    );

    // 7) Impersonate token contract for staking calls
    await ethers.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    // Fund for gas
    await ethers.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

    // Approve staking for user for initial stake
    await token.connect(user).approve(stakingModule.target, STAKE_AMOUNT);
    // Initial stake to set up state
    await stakingModule.connect(tokenSigner).stakeTokensFor(user.address, STAKE_AMOUNT, 3);
  });

  afterEach(async function () {
    // Stop impersonation
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  describe("Admin functions", function () {
    it("only owner can setRewardConfig", async function () {
      await expect(
        stakingModule.connect(user).setRewardConfig(6, 2, 5)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await stakingModule.connect(owner).setRewardConfig(6, 2, 5);
      const cfg = await stakingModule.rewardConfigs(6);
      expect(cfg.nftCount).to.equal(2);
      expect(cfg.discountPercent).to.equal(5);
    });
  });

  describe("Pause / Unpause", function () {
    it("pause blocks stake and unstake", async function () {
      // Pause
      await stakingModule.connect(owner).pause();

      // Stake should revert
      await expect(
        stakingModule.connect(tokenSigner).stakeTokensFor(
          user.address,
          STAKE_AMOUNT,
          3
        )
      ).to.be.revertedWith("Pausable: paused");

      // Unstake should revert
      await expect(
        stakingModule.connect(tokenSigner).unstakeTokensFor(user.address, 0)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("unpause restores stake and unstake", async function () {
      // Pause and then unpause
      await stakingModule.connect(owner).pause();
      await stakingModule.connect(owner).unpause();

      // Re-approve staking for user for the second stake
      await token.connect(user).approve(stakingModule.target, STAKE_AMOUNT);

      // Stake should work again
      await expect(
        stakingModule.connect(tokenSigner).stakeTokensFor(
          user.address,
          STAKE_AMOUNT,
          3
        )
      ).to.emit(stakingModule, "Staked");

      // Fast-forward >3 months
      const threeMonths = 3 * 30 * 24 * 3600 + 1;
      await network.provider.send("evm_increaseTime", [threeMonths]);
      await network.provider.send("evm_mine");

      // Provide reward funds
      await token.connect(owner).transfer(
        stakingModule.target,
        ethers.parseUnits("100", 8)
      );

      // Unstake second stake at index 1
      await expect(
        stakingModule.connect(tokenSigner).unstakeTokensFor(user.address, 1)
      ).to.emit(stakingModule, "Unstaked");
    });
  });
});
