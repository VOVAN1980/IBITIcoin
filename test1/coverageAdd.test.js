const { expect } = require("chai");
const { ethers }  = require("hardhat");

/* ─── MockPriceFeed ─────────────────────────────────────────────── */
describe("MockPriceFeed", () => {
  let feed;
  const INITIAL = 12345678n;

  beforeEach(async () => {
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    feed = await MockPriceFeed.deploy(INITIAL);
    await feed.waitForDeployment();
  });

  it("decimals / description / version", async () => {
    expect(await feed.decimals()).to.equal(8);
    expect(await feed.description()).to.equal("Mock Price Feed");
    expect(await feed.version()).to.equal(1);
  });

  it("latestRoundData returns stub values", async () => {
    const [, answer] = await feed.latestRoundData();
    expect(answer).to.equal(INITIAL);
  });
});

/* ─── MockUniswapV2Pair ─────────────────────────────────────────── */
describe("MockUniswapV2Pair", () => {
  let pair;
  const R0 = 500n, R1 = 2000n;

  beforeEach(async () => {
    const Pair = await ethers.getContractFactory("MockUniswapV2Pair");
    pair = await Pair.deploy(R0, R1);
    await pair.waitForDeployment();
  });

  it("metadata and reserves", async () => {
    const [r0, r1] = await pair.getReserves();
    expect(r0).to.equal(R0);
    expect(r1).to.equal(R1);
  });

  it("swap stub does not revert", async () => {
    await expect(pair.swap(1, 1, ethers.ZeroAddress, "0x")).not.to.be.reverted;
  });
});

/* ─── VolumeWeightedOracle ──────────────────────────────────────── */
describe("VolumeWeightedOracle", () => {
  let oracle, p1, p2;

  beforeEach(async () => {
    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(6);
    await oracle.waitForDeployment();

    const Pair = await ethers.getContractFactory("MockUniswapV2Pair");
    p1 = await Pair.deploy(100n, 50n);
    p2 = await Pair.deploy(200n, 200n);
    await p1.waitForDeployment();
    await p2.waitForDeployment();

    await oracle.addPool(p1.target);
    await oracle.addPool(p2.target);
  });

  it("add / remove pools", async () => {
    expect(await oracle.pools(0)).to.equal(p1.target);
    await oracle.removePool(p1.target);
    expect(await oracle.pools(0)).to.equal(p2.target);
  });

  it("weighted price", async () => {
    await oracle.updatePrice();
    expect(await oracle.getPrice()).to.equal(833333n);
  });
});

/* ─── BridgeManager ─────────────────────────────────────────────── */
describe("BridgeManager", () => {
  let bm, owner, other;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const BM = await ethers.getContractFactory("BridgeManager");
    bm = await BM.deploy();
    await bm.waitForDeployment();
  });

  it("owner / controller permissions", async () => {
    const br = ethers.Wallet.createRandom().address;
    await expect(bm.connect(other).setBridge(br, true))
      .to.be.revertedWith("Only owner");
    await bm.setBridge(br, true);
    expect(await bm.isTrustedBridge(br)).to.equal(true);
  });
});

/* ─── UserStatusManager ─────────────────────────────────────────── */
describe("UserStatusManager", () => {
  let usm, owner, a, b;

  beforeEach(async () => {
    [owner, a, b] = await ethers.getSigners();
    const USM = await ethers.getContractFactory("UserStatusManager");
    usm = await USM.deploy();
    await usm.waitForDeployment();
  });

  it("VIP override + manual batch", async () => {
    await usm.setVIPOverride(a.address, true);
    expect(await usm.isVIPUser(a.address)).to.equal(true);
    for (const [addr, flag] of [[a.address, false], [b.address, true]]) {
      await usm.setVIPOverride(addr, flag);
    }
    expect(await usm.isVIPUser(b.address)).to.equal(true);
  });

  it("bot flag + manual batch", async () => {
    await usm.flagBot(a.address, true);
    expect(await usm.isFlaggedBot(a.address)).to.equal(true);
    for (const [addr, flag] of [[a.address, false], [b.address, true]]) {
      await usm.flagBot(addr, flag);
    }
    expect(await usm.isFlaggedBot(b.address)).to.equal(true);
  });

  it("whale override & pause does not block setters", async () => {
    await usm.setWhaleOverride(a.address, true);
    await usm.pause();
    await expect(usm.setWhaleOverride(b.address, true)).not.to.be.reverted;
  });
});

/* ─── DummyStakingModule & DAO Impl ─────────────────────────────── */
describe("DummyStakingModule & DAOModuleImplementation", () => {
  let dummy, daoImpl, token, nftDiscount, owner;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const Dummy = await ethers.getContractFactory("DummyStakingModule");
    dummy = await Dummy.deploy();
    await dummy.waitForDeployment();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("TK", "TK", owner.address, 0);
    await token.waitForDeployment();

    const NFTD = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTD.deploy();
    await nftDiscount.waitForDeployment();

    const Impl = await ethers.getContractFactory("DAOModuleImplementation");
    daoImpl = await Impl.deploy(token.target, nftDiscount.target);
    await daoImpl.waitForDeployment();
  });

  it("Dummy staking is no-op", async () => {
    await expect(dummy.stakeTokensFor(owner.address, 1, 1)).not.to.be.reverted;
    await expect(dummy.unstakeTokensFor(owner.address, 0)).not.to.be.reverted;
  });

  it("DAO getters", async () => {
    expect(await daoImpl.getToken()).to.equal(token.target);
    expect(await daoImpl.getNFTDiscount()).to.equal(nftDiscount.target);
  });
});
