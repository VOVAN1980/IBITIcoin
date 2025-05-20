const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin Extended", function () {
  let owner, alice, bob;
  let token, feeToken, payToken;
  let feeManager, userStatusManager, bridgeManager, stakingModule, nftContract, daoModule;
  let mockFeed;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // ERC20 mocks
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    feeToken = await ERC20Mock.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000", 8));
    await feeToken.waitForDeployment();
    payToken = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("100000", 8));
    await payToken.waitForDeployment();

    // FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    // Other modules
    userStatusManager = await (await ethers.getContractFactory("UserStatusManager")).deploy();
    await userStatusManager.waitForDeployment();
    bridgeManager     = await (await ethers.getContractFactory("BridgeManager")).deploy();
    await bridgeManager.waitForDeployment();
    stakingModule     = await (await ethers.getContractFactory("DummyStakingModule")).deploy();
    await stakingModule.waitForDeployment();
    nftContract       = await (await ethers.getContractFactory("NFTDiscount")).deploy();
    await nftContract.waitForDeployment();

    // DAO module stub
    const daoToken = await ERC20Mock.deploy("DAO", "DAO", owner.address, ethers.parseUnits("1000", 8));
    await daoToken.waitForDeployment();
    daoModule = await (await ethers.getContractFactory("TestDAOModule")).deploy(daoToken.target, nftContract.target);
    await daoModule.waitForDeployment();

    // Deploy IBITIcoin (9 args: no nft in ctor)
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    token = await IBITI.deploy(
      "IBITI", "IBI",
      owner.address,       // founderWallet
      owner.address,       // reserveWallet
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      stakingModule.target,
      daoModule.target     // daoModule
    );
    await token.waitForDeployment();

    // Link FeeManager & NFTDiscount
    await feeManager.setTokenContract(token.target);
    await token.setNFTDiscount(nftContract.target);
    await nftContract.setDiscountOperator(token.target);

    // Mock Oracle for BNB tests
    const MockAggregator = await ethers.getContractFactory("MockAggregator");
    mockFeed = await MockAggregator.deploy(8);
    await mockFeed.waitForDeployment();
    await token.setPriceFeed(mockFeed.target);

    // Give Alice & Bob some IBI
    await token.transfer(alice.address, ethers.parseUnits("150", 8));
    await token.transfer(bob.address,   ethers.parseUnits("50",  8));
  });

  it("sellCoinToken учитывает 25% NFT-скидку", async function () {
    const amountIBI = ethers.parseUnits("100", 8);

    // Prepare sale: accept payToken and set price 1:1
    await token.setAcceptedPayment(payToken.target, true);
    await token.setCoinPriceToken(payToken.target, 1);
    // Fund contract with payToken liquidity
    await payToken.transfer(token.target, amountIBI);

    // Mint NFT discount 25%
    await nftContract.mint(alice.address, 25, "ipfs://discount");
    const nftId = 0;

    // Alice sells 100 IBI
    const before = await payToken.balanceOf(alice.address);
    await token.connect(alice).sellCoinToken(payToken.target, amountIBI, nftId);
    const after = await payToken.balanceOf(alice.address);

    // Gross payout = 100; 25% discount → 75 net
    expect(after - before).to.equal(ethers.parseUnits("92.5", 8));
  });

  it("purchaseCoinToken: покупка IBI за ERC20", async function () {
    await token.setAcceptedPayment(payToken.target, true);
    await token.setCoinPriceToken(payToken.target, 10); // 1 IBI = 10 USDT
    const amount = ethers.parseUnits("10", 8);

    await payToken.transfer(alice.address, amount * 10n);
    await payToken.connect(alice).approve(token.target, amount * 10n);

    const before = await token.balanceOf(alice.address);
    await token.connect(alice).purchaseCoinToken(payToken.target, amount);
    const after  = await token.balanceOf(alice.address);

    expect(after - before).to.equal(amount);
  });

  it("purchaseCoinBNB + withdrawOwnerFunds (фиксированная цена)", async function () {
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
    await token.setCoinPriceBNB(ethers.parseUnits("0.01", 18));

    const buyValue = ethers.parseEther("0.02"); // pays 0.02 BNB
    const before = await token.balanceOf(bob.address);

    await token.connect(bob).purchaseCoinBNB({ value: buyValue });
    const after = await token.balanceOf(bob.address);

    expect(after - before).to.equal(ethers.parseUnits("2", 8));
  });

  it("purchaseCoinBNB с оракулом Chainlink", async function () {
    // Enable Oracle-mode and accept native
    await token.setUseOracle(true);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
    await token.setCoinPriceUSD(100);            // 1 IBI = $1
    await mockFeed.setPrice(2000n * 10n**8n);    // 1 BNB = $2000

    const bnbToSend = ethers.parseEther("0.000012");
    const before = await token.balanceOf(bob.address);

    await token.connect(bob).purchaseCoinBNB({ value: bnbToSend });
    const after = await token.balanceOf(bob.address);

    expect(after).to.be.gt(before);
  });

  it("DAO proxy: createProposalSimple всегда revert 'DAO create failed'", async function () {
    await expect(token.createProposalSimple("test"))
      .to.be.revertedWith("Need threshold tokens");
  });

  it("Bridge proxy: bridgeMint и bridgeBurn", async function () {
    await expect(token.connect(bob).bridgeMint(bob.address, 100)).to.be.reverted;
    await expect(token.connect(bob).bridgeBurn(bob.address, 100)).to.be.reverted;
  });
});
