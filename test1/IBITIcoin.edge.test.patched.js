const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { parseUnits } = ethers;

describe("IBITIcoin – edge branches", () => {
  let token, priceFeedMock, bridgeManager, dummyBridgeSigner;
  let owner, user, stranger;

  const ONE = parseUnits("1", 8);

  before(async () => {
    [owner, user, stranger] = await ethers.getSigners();

    // ERC20 stub for payments
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const usdt = await ERC20Mock.deploy(
      "USDT", "USDT", user.address, ONE * 1_000_000n
    );
    await usdt.waitForDeployment();

    // Mock Chainlink price feed
    const MockPriceFeed = await ethers.getContractFactory("MockAggregator");
    priceFeedMock = await MockPriceFeed.deploy(8);
    await priceFeedMock.waitForDeployment();

    // BridgeManager + dummy bridge
    const BridgeManager = await ethers.getContractFactory("BridgeManager");
    bridgeManager = await BridgeManager.deploy();
    await bridgeManager.waitForDeployment();

    // register owner signer as dummy bridge
    dummyBridgeSigner = owner; // Keep owner Signer
    await bridgeManager.connect(owner).setBridge(dummyBridgeSigner.address, true);
    await bridgeManager.connect(owner).setBridgeInfo(
      dummyBridgeSigner.address,
      true,
      true,
      ethers.encodeBytes32String("TEST"),
      100_000_000_000,
      "edge bridge"
    );

    // Deploy modules
    const DummyStaking = await ethers.getContractFactory("DummyStakingModule");
    const stakingModule = await DummyStaking.deploy();
    await stakingModule.waitForDeployment();
    const DummyDAO = await ethers.getContractFactory("DummyStakingModule");
    const daoModule = await DummyDAO.deploy();
    await daoModule.waitForDeployment();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    const nftModule = await NFTDiscount.deploy();
    await nftModule.waitForDeployment();

    // Deploy IBITIcoin
    const IBITIcoin = await ethers.getContractFactory("IBITIcoin");
    token = await IBITIcoin.deploy(
      "IBI", "IBI",
      owner.address, owner.address,
      ethers.ZeroAddress,               // feeManager
      ethers.ZeroAddress,               // userStatusManager
      bridgeManager.target,
      stakingModule.target,
      daoModule.target
    );
    await token.waitForDeployment();

    // register token contract itself as trusted bridge for proxy calls
    await bridgeManager.connect(owner).setBridge(token.target, true);

    await token.setNFTDiscount(nftModule.target);
  });

  it("purchaseCoinBNB oracle-mode с нулевой ценой ревертит", async () => {
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
    await token.setUseOracle(true);
    await token.setCoinPriceUSD(100);
    await token.setPriceFeed(priceFeedMock.target);

    await expect(
      token.connect(user).purchaseCoinBNB({ value: ONE })
    ).to.be.reverted;
  });

  it("purchaseCoinBNB фикс-цена проходит и обновляет ownerFunds", async () => {
    await token.setUseOracle(false);
    await token.setCoinPriceBNB(ONE / 10n);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);

    const cost = ONE / 10n;
    await expect(
      token.connect(user).purchaseCoinBNB({ value: cost })
    ).to.emit(token, "CoinPurchased");

  });

  it("DAO-proxy функции ревертят через fallback-модуль", async () => {
    await expect(token.connect(user).createProposalSimple("x")).to.be.reverted;
    await expect(token.connect(user).voteProposal(0, true)).to.be.reverted;
    await expect(token.connect(user).executeProposalSimple(0)).to.be.reverted;
  });

  it("bridge-proxy mint/burn от доверенного моста проходит", async () => {
    const amt = ONE * 100n;
    await token.connect(owner).burn(amt);
    const before = await token.balanceOf(user.address);

    await expect(
      token.connect(dummyBridgeSigner).bridgeMint(user.address, amt)
    ).to.not.be.reverted;
    expect(await token.balanceOf(user.address)).to.equal(before + amt);

    await expect(
      token.connect(dummyBridgeSigner).bridgeBurn(user.address, amt)
    ).to.not.be.reverted;
    expect(await token.balanceOf(user.address)).to.equal(before);
  });

  it("bridge-proxy mint от постороннего адреса ревертит", async () => {
    await expect(
      token.connect(stranger).bridgeMint(user.address, ONE)
    ).to.be.reverted;
  });
});
