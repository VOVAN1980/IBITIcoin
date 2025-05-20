const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin — extra coverage", function () {
  let owner, alice, bob;
  let paymentToken, feeManager;
  let userStatusManager, bridgeManager;
  let nftDiscount, stakingModule;
  let IBITI, ibiti;

  const DECIMALS = 8;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // 1. ERC20 for payments
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    paymentToken = await ERC20Mock.deploy(
      "PayToken", "PTK",
      owner.address,
      ethers.parseEther("1000")
    );
    await paymentToken.waitForDeployment();

    // 2. FeeManager
    feeManager = await (await ethers.getContractFactory("FeeManager"))
      .deploy(paymentToken.target);
    await feeManager.waitForDeployment();

    // 3. UserStatusManager
    userStatusManager = await (await ethers.getContractFactory("UserStatusManager"))
      .deploy();
    await userStatusManager.waitForDeployment();

    // 4. BridgeManager
    bridgeManager = await (await ethers.getContractFactory("BridgeManager"))
      .deploy();
    await bridgeManager.waitForDeployment();

    // 5. NFTDiscount
    nftDiscount = await (await ethers.getContractFactory("NFTDiscount"))
      .deploy();
    await nftDiscount.waitForDeployment();

    // 6. Deploy IBITIcoin without stakingModule
    IBITI = await ethers.getContractFactory("IBITIcoin");
    ibiti = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      ethers.ZeroAddress,
      owner.address
    );
    await ibiti.waitForDeployment();

    // 7. Deploy & bind StakingModule
    stakingModule = await (await ethers.getContractFactory("StakingModule"))
      .deploy(ibiti.target, nftDiscount.target);
    await stakingModule.waitForDeployment();
    await ibiti.connect(owner).setStakingModule(stakingModule.target);

    // Link FeeManager & NFTDiscount
    await feeManager.setTokenContract(ibiti.target);
    await ibiti.setNFTDiscount(nftDiscount.target);

    // fund Alice for staking
    await ibiti.transfer(alice.address, ethers.parseUnits("100", DECIMALS));
    await ibiti.connect(alice).approve(
      stakingModule.target,
      ethers.parseUnits("100", DECIMALS)
    );
  });

  it("stakeTokens does not revert and mints no fees internally", async function () {
    await expect(
      ibiti.connect(alice).stakeTokens(
        ethers.parseUnits("10", DECIMALS),
        1
      )
    ).to.not.be.reverted;
  });

  describe("DAO proxy success", function () {
    let mockDAO;
    beforeEach(async function () {
      mockDAO = await (await ethers.getContractFactory("MockDAOSuccess"))
        .deploy();
      await mockDAO.waitForDeployment();

      ibiti = await IBITI.deploy(
        "IBITI", "IBI",
        owner.address,
        owner.address,
        feeManager.target,
        userStatusManager.target,
        bridgeManager.target,
        stakingModule.target,
        mockDAO.target
      );
      await ibiti.waitForDeployment();
      await feeManager.setTokenContract(ibiti.target);
      await ibiti.setNFTDiscount(nftDiscount.target);
    });

    it("createProposalSimple doesn't revert", async function () {
      await expect(ibiti.connect(alice).createProposalSimple("Test"))
        .to.not.be.reverted;
    });

    it("voteProposal doesn't revert", async function () {
      await expect(ibiti.connect(alice).voteProposal(1, true))
        .to.not.be.reverted;
    });

    it("executeProposalSimple doesn't revert", async function () {
      await expect(ibiti.connect(alice).executeProposalSimple(1))
        .to.not.be.reverted;
    });
  });

  describe("Bridge proxy success", function () {
    beforeEach(async function () {
      await bridgeManager.connect(owner).setBridge(ibiti.target, true);
      await bridgeManager.connect(owner).setBridge(alice.address, true);

      const typ = ethers.encodeBytes32String("T");
      await bridgeManager.connect(owner).setBridgeInfo(
        alice.address,
        true,
        true,
        typ,
        ethers.parseUnits("100000", DECIMALS),
        "Bridge description"
      );

      await ibiti.connect(owner).transfer(bob.address, ethers.parseUnits("20", DECIMALS));
      await ibiti.connect(bob).approve(alice.address, ethers.parseUnits("20", DECIMALS));
    });

    it("bridgeMint and bridgeBurn by trusted bridge work correctly", async function () {
      expect(await ibiti.balanceOf(bob.address)).to.equal(ethers.parseUnits("20", DECIMALS));

      await ibiti.connect(bob).burn(ethers.parseUnits("2", DECIMALS));
      expect(await ibiti.balanceOf(bob.address)).to.equal(ethers.parseUnits("18", DECIMALS));

      await expect(
        ibiti.connect(alice).bridgeMint(bob.address, ethers.parseUnits("2", DECIMALS))
      ).to.not.be.reverted;
      expect(await ibiti.balanceOf(bob.address)).to.equal(ethers.parseUnits("20", DECIMALS));

      await expect(
        ibiti.connect(alice).bridgeBurn(bob.address, ethers.parseUnits("2", DECIMALS))
      ).to.not.be.reverted;
      expect(await ibiti.balanceOf(bob.address)).to.equal(ethers.parseUnits("18", DECIMALS));
    });
  });

  describe("purchaseCoinBNB — simple", function () {
    let freshIbiti;
    beforeEach(async function () {
      freshIbiti = await IBITI.deploy(
        "IBITI", "IBI",
        owner.address,
        owner.address,
        feeManager.target,
        userStatusManager.target,
        bridgeManager.target,
        stakingModule.target,
        owner.address
      );
      await freshIbiti.waitForDeployment();
      await feeManager.setTokenContract(freshIbiti.target);
      await freshIbiti.setNFTDiscount(nftDiscount.target);
      await freshIbiti.connect(owner).setAcceptedPayment(ethers.ZeroAddress, true);
      await freshIbiti.connect(owner).setCoinPriceBNB(1);
    });

    it("refunds excess BNB", async function () {
      const beforeBal = await freshIbiti.balanceOf(alice.address);
      await freshIbiti.connect(alice).purchaseCoinBNB({ value: 10 });
      const afterBal = await freshIbiti.balanceOf(alice.address);
      expect(afterBal - beforeBal).to.equal(ethers.parseUnits("10", DECIMALS));
    });
  });

  describe("rescueETH", function () {
    it("rescues ETH and reverts on zero address", async function () {
      await alice.sendTransaction({ to: ibiti.target, value: 1n });
      await expect(ibiti.connect(owner).rescueETH(owner.address)).to.not.be.reverted;
      expect(await ethers.provider.getBalance(ibiti.target)).to.equal(0n);
      await expect(ibiti.connect(owner).rescueETH(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("admin setters", function () {
    it("setAcceptedPayment & setCoinPriceToken", async function () {
      await expect(ibiti.connect(owner).setAcceptedPayment(paymentToken.target, true))
        .to.not.be.reverted;
      await expect(ibiti.connect(owner).setCoinPriceToken(paymentToken.target, 123))
        .to.not.be.reverted;
    });

    it("setCoinPriceBNB / setUseOracle / setCoinPriceUSD", async function () {
      await expect(ibiti.connect(owner).setCoinPriceBNB(42)).to.not.be.reverted;
      await expect(ibiti.connect(owner).setUseOracle(true)).to.not.be.reverted;
      await expect(ibiti.connect(owner).setCoinPriceUSD(99)).to.not.be.reverted;
    });
  });
});
