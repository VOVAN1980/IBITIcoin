const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Extra Coverage Tests", function() {
  let owner, user, daoOwner, treasury;
  let erc, discount, daoModule;
  let IBITINFT, nft;
  let IBITIcoinFactory, token;
  let MockUniswapPair, pool, VolumeWeightedOracle, oracle;
  let StakingModule;
  let TeamVesting, vesting;

  beforeEach(async function() {
    [owner, user, daoOwner, treasury] = await ethers.getSigners();

    // 1) ERC20Mock, NFTDiscount, DAOModuleImplementation
    const ERC20Mock     = await ethers.getContractFactory("ERC20Mock");
    erc                = await ERC20Mock.deploy("Mock", "MCK", owner.address, ethers.parseUnits("1000", 8));
    await erc.waitForDeployment();
    const NFTDiscount  = await ethers.getContractFactory("NFTDiscount");
    discount           = await NFTDiscount.deploy();
    await discount.waitForDeployment();
    const DAOModuleImpl = await ethers.getContractFactory("DAOModuleImplementation");
    daoModule          = await DAOModuleImpl.deploy(erc.target, discount.target);
    await daoModule.waitForDeployment();

    // 2) IBITINFT instance
    IBITINFT = await ethers.getContractFactory("IBITINFT");
    nft      = await IBITINFT.deploy(
      "TestNFT", "TNFT",
      100, 200,      // nftPrice, nftPriceUSDT
      100,           // priceGrowthRate
      5,             // salesThreshold
      erc.target     // ibitiToken
    );
    await nft.waitForDeployment();

    // 3) Core modules for IBITIcoin
    const FeeManager = await ethers.getContractFactory("FeeManager");
    const feeMgr     = await FeeManager.deploy(erc.target);
    await feeMgr.waitForDeployment();
    const USM        = await ethers.getContractFactory("UserStatusManager");
    const usm        = await USM.deploy(); await usm.waitForDeployment();
    const BM         = await ethers.getContractFactory("BridgeManager");
    const bm         = await BM.deploy(); await bm.waitForDeployment();
    const DummyStake = await ethers.getContractFactory("DummyStakingModule");
    const ds         = await DummyStake.deploy(); await ds.waitForDeployment();
    const MockDAO    = await ethers.getContractFactory("MockDAO");
    const mockDao    = await MockDAO.deploy(); await mockDao.waitForDeployment();

    // 4) IBITIcoin (передаём 9 аргументов)
    IBITIcoinFactory = await ethers.getContractFactory("IBITIcoin");
    token = await IBITIcoinFactory.deploy(
      "IBITI", "IBI",
      owner.address,
      owner.address,
      feeMgr.target,
      usm.target,
      bm.target,
      ds.target,         // stakingModule
      ethers.ZeroAddress // daoModule unset
    );
    await token.waitForDeployment();

    // 4.1) Настраиваем NFTDiscount
    await token.setNFTDiscount(discount.target);
    await discount.setDiscountOperator(token.target);

    // 5) MockUniswapV2Pair + Oracle
    MockUniswapPair    = await ethers.getContractFactory("MockUniswapV2Pair");
    pool               = await MockUniswapPair.deploy(0, 0); await pool.waitForDeployment();
    VolumeWeightedOracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle             = await VolumeWeightedOracle.deploy(18); await oracle.waitForDeployment();

    // 6) StakingModule factory
    StakingModule = await ethers.getContractFactory("StakingModule");

    // 7) TeamVesting
    TeamVesting = await ethers.getContractFactory("TeamVesting");
    const start = (await ethers.provider.getBlock()).timestamp + 1;
    vesting = await TeamVesting.deploy(
      ethers.parseUnits("1000", 8),
      start,
      user.address
    );
    await vesting.waitForDeployment();
  });

  it("DAOModule: revert on createProposal with invalid period", async function() {
    const max = await daoModule.maxVotingPeriod();
    await expect(
      daoModule.createProposal("desc", max + 1n)
    ).to.be.revertedWith("Invalid voting period");
  });

  it("IBITINFT: purchaseNFTWithUSDT reverts when USDT not set", async function() {
    await expect(
      nft.connect(user).purchaseNFTWithUSDT("ipfs://cid")
    ).to.be.revertedWith("USDT token not set");
  });

  it("IBITINFT: updateNFTPriceMonthly reverts too early and when threshold zero", async function() {
    await expect(nft.updateNFTPriceMonthly())
      .to.be.revertedWith("Update not allowed yet");
    const nftZero = await IBITINFT.deploy(
      "TestNFT", "TNFT",
      100, 200, 100, 0, erc.target
    );
    await nftZero.waitForDeployment();
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine");
    await expect(nftZero.updateNFTPriceMonthly())
      .to.be.revertedWith("Sales threshold not set");
  });

  it("IBITIcoin: DAO proxy fallbacks behave correctly when daoModule unset", async function() {
    await expect(token.connect(user).createProposalSimple("x")).to.not.be.reverted;
    await expect(token.connect(user).voteProposal(0, true)).to.not.be.reverted;
    await expect(token.connect(user).executeProposalSimple(0)).to.not.be.reverted;
  });

  it("MockUniswapV2Pair: skim and sync do not revert", async function() {
    await expect(pool.skim(owner.address)).to.not.be.reverted;
    await expect(pool.sync()).to.not.be.reverted;
  });

  it("NFTDiscount: useDiscount burns expired NFT", async function() {
    await discount.connect(owner).mint(user.address, 1, "uri1");
    const tid = 0;
    // Fast-forward past expiration (31 days)
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine");

    // Expect revert on expired NFT
    await expect(
      discount.connect(user).useDiscount(tid)
    ).to.be.revertedWith("Discount NFT expired");
  });

  it("StakingModule: unstake early, on-time, expired branches work", async function() {
  const StakingERC = await ethers.getContractFactory("ERC20Mock");
  const stakeToken = await StakingERC.deploy("TK", "TK", owner.address, ethers.parseUnits("1000", 8));
  await stakeToken.waitForDeployment();
  const staking2 = await StakingModule.deploy(stakeToken.target, discount.target);
  await staking2.waitForDeployment();
  await staking2.setTreasury(treasury.address);

  // Раздаём и даём одобрение
  await stakeToken.transfer(user.address, ethers.parseUnits("100", 8));
  await stakeToken.connect(user).approve(staking2.target, ethers.parseUnits("100", 8));

  // Импersonate-им токен-контракт
  await ethers.provider.send("hardhat_impersonateAccount", [stakeToken.target]);
  const tokenSigner = await ethers.getSigner(stakeToken.target);
  // Фандим эфиром, чтобы у impersonated-аккаунта был баланс для оплаты газа
  await ethers.provider.send("hardhat_setBalance", [stakeToken.target, "0x1000000000000000000"]);

  // 1) Раннее расторжение (duration = 2)
  await staking2.connect(tokenSigner).stakeTokensFor(user.address, ethers.parseUnits("10", 8), 2);
  await expect(
    staking2.connect(tokenSigner).unstakeTokensFor(user.address, 0)
  ).to.not.be.reverted;

  // 2) Своевременное расторжение (duration = 1, +30 дней +1 секунда)
  await staking2.connect(tokenSigner).stakeTokensFor(user.address, ethers.parseUnits("10", 8), 1);
  await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600 + 1]);
  await ethers.provider.send("evm_mine");
  await expect(
    staking2.connect(tokenSigner).unstakeTokensFor(user.address, 0)
  ).to.not.be.reverted;

  // 3) Просроченное расторжение (duration = 1, +230 дней)
  await staking2.connect(tokenSigner).stakeTokensFor(user.address, ethers.parseUnits("10", 8), 1);
  await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600 + 200 * 24 * 3600]);
  await ethers.provider.send("evm_mine");
  await expect(
    staking2.connect(tokenSigner).unstakeTokensFor(user.address, 0)
  ).to.not.be.reverted;

  // Отменяем импersonation
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [stakeToken.target]);
});

  it("VolumeWeightedOracle: getPrice returns 0 when no pools or zero reserves", async function() {
    expect(await oracle.getPrice()).to.equal(0);
    await oracle.addPool(pool.target);
    expect(await oracle.getPrice()).to.equal(0);
  });
});