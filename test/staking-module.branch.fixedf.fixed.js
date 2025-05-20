const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingModule — branch coverage", () => {
  let staking, token, nftDiscount;
  let owner, alice, bob;
  let tokenSigner;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy mock token and give alice some
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("TK", "TK", owner.address, ethers.parseEther("1000"));
    await token.waitForDeployment();
    await token.transfer(alice.address, ethers.parseEther("100"));

    // Deploy NFTDiscount and staking
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    const StakingModule = await ethers.getContractFactory("StakingModule");
    staking = await StakingModule.deploy(token.target, nftDiscount.target);
    await staking.waitForDeployment();

    // Set treasury
    await staking.setTreasury(bob.address);

    // Impersonate token contract to call stakeTokensFor
    await ethers.provider.send("hardhat_impersonateAccount", [token.target]);
    tokenSigner = await ethers.getSigner(token.target);
    await ethers.provider.send("hardhat_setBalance", [token.target, "0x1000000000000000000"]);

    // Allow staking contract to pull alice's tokens
    await token.connect(alice).approve(staking.target, ethers.MaxUint256);
  });

  afterEach(async () => {
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [token.target]);
  });

  describe("Admin setters and view helpers", () => {
    it("setRewardConfig: rejects bad duration", async () => {
      await expect(
        staking.setRewardConfig(0, 1, 5)
      ).to.be.revertedWith("Bad duration");

      await expect(
        staking.setRewardConfig(13, 1, 5)
      ).to.be.revertedWith("Bad duration");
    });

    it("setRewardConfig: rejects too large nftCount or discount", async () => {
      await expect(
        staking.setRewardConfig(3, 21, 5)
      ).to.be.revertedWith("NFT count too large");

      await expect(
        staking.setRewardConfig(3, 1, 101)
      ).to.be.revertedWith("Discount >100%");
    });

    it("getStakeCount / getStakeInfo: invalid index", async () => {
      expect(await staking.getStakeCount(alice.address)).to.equal(0);
      await expect(
        staking.getStakeInfo(alice.address, 0)
      ).to.be.revertedWith("Bad index");
    });

    it("excessTokens: zero vs positive", async () => {
      expect(await staking.excessTokens()).to.equal(0n);
      await token.transfer(staking.target, ethers.parseEther("5"));
      expect(await staking.excessTokens()).to.equal(ethers.parseEther("5"));
    });
  });

  describe("Skim & rescue", () => {
    it("skimExcessToTreasury: preconditions", async () => {
      await expect(
        staking.skimExcessToTreasury(1)
      ).to.be.revertedWith("Amount too large");
    });

    it("skimExcessToTreasury: success path", async () => {
      await token.transfer(staking.target, ethers.parseEther("3"));
      const before = await token.balanceOf(bob.address);
      await expect(
        staking.skimExcessToTreasury(ethers.parseEther("2"))
      ).to.emit(staking, "ExcessSkimmed").withArgs(bob.address, ethers.parseEther("2"));
      const after = await token.balanceOf(bob.address);
      expect(after - before).to.equal(ethers.parseEther("2"));
    });

    it("rescueTokens: rejects rescue of staking token", async () => {
      await expect(
        staking.rescueTokens(token.target, alice.address, ethers.parseEther("1"))
      ).to.be.revertedWith("Use skimExcess");
    });

    it("rescueTokens: success for other ERC20", async () => {
      const other = await (await ethers.getContractFactory("ERC20Mock"))
        .deploy("O", "O", owner.address, ethers.parseEther("5"));
      await other.transfer(staking.target, ethers.parseEther("3"));
      await expect(
        staking.rescueTokens(other.target, alice.address, ethers.parseEther("3"))
      ).to.emit(staking, "TokensRescued").withArgs(other.target, alice.address, ethers.parseEther("3"));
      expect(await other.balanceOf(alice.address)).to.equal(ethers.parseEther("3"));
    });
  });

  describe("skimExcess enforces totalStaked", () => {
    it("does not skim when staked tokens present", async () => {
      // Stake 10 tokens for alice via impersonated token
      await staking.connect(tokenSigner).stakeTokensFor(alice.address, ethers.parseEther("10"), 1);
      await token.transfer(staking.target, ethers.parseEther("5"));
      await expect(
        staking.skimExcessToTreasury(ethers.parseEther("6"))
      ).to.be.revertedWith("Amount too large");
    });
  });
});
