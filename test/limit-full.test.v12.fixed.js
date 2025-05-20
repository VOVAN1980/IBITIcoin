
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – лимиты + базовые функции", function () {
  const LVL_LEGENDARY = 2;
  const LVL_JACKPOT   = 5;

  let nft, saleManager, usdt, ibiti, oracle;
  let stakingModule, daoModule;
  let owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    usdt  = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("100000", 8));
    ibiti = await ERC20Mock.deploy("IBITI", "IBITI", owner.address, ethers.parseUnits("100000", 8));
    await Promise.all([usdt.waitForDeployment(), ibiti.waitForDeployment()]);

    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(8);
    await oracle.waitForDeployment();

    const SaleMgr = await ethers.getContractFactory("NFTSaleManager");
    saleManager = await SaleMgr.deploy(
      await nft.getAddress(),
      await ibiti.getAddress(),
      await usdt.getAddress(),
      await oracle.getAddress()
    );
    await saleManager.waitForDeployment();
    await nft.setDiscountOperator(await saleManager.getAddress());
    await saleManager.setNFTPrice(10, 50);

    const DummyStaking = await ethers.getContractFactory("DummyStakingModule");
    stakingModule = await DummyStaking.deploy();
    await stakingModule.waitForDeployment();
    await nft.setStakingModule(await stakingModule.getAddress());
    await nft.setJackpotMinter(await stakingModule.getAddress(), true);

    const TestDAO = await ethers.getContractFactory("TestDAOModule");
    daoModule = await TestDAO.deploy(await ibiti.getAddress(), await nft.getAddress());
    await daoModule.waitForDeployment();
    await nft.setDAOModule(await daoModule.getAddress());
    await nft.setDiscountOperator(await daoModule.getAddress());

    await daoModule.createProposalSimple("p0");
    await daoModule.createProposalSimple("p1");
    await daoModule.createProposalSimple("p2");
  });

  it("✅ mint с допустимыми параметрами", async () => {
    await nft.setDiscountOperator(await owner.getAddress());
    await nft.setMonthlyLimit(LVL_LEGENDARY, 3);
    await nft.mint(alice.address, 10, "ipfs://ok1");
    expect(await nft.balanceOf(alice.address)).to.equal(1n);
  });

  it("✅ mint: уникальность URI", async () => {
    await nft.setDiscountOperator(await owner.getAddress());
    await nft.mint(bob.address, 10, "ipfs://dup-ok");
    await expect(
      nft.mint(alice.address, 10, "ipfs://dup-ok")
    ).to.be.revertedWith("URI already used");
  });

  it("✅ обычный transfer между пользователями", async () => {
    await nft.setDiscountOperator(await owner.getAddress());
    await nft.mint(alice.address, 10, "ipfs://t1");
    await nft.connect(alice).transferFrom(alice.address, bob.address, 0);
    expect(await nft.ownerOf(0)).to.equal(bob.address);
  });

  it("✅ transfer Jackpot запрещён", async () => {
    await nft.setJackpotMinter(await owner.getAddress(), true);
    await nft.mintJackpot(alice.address, 20, "ipfs://j-locked");
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 0)
    ).to.be.revertedWith("Jackpot NFTs are non-transferable");
  });

  it("mint — превышение лимита Legendary", async () => {
    await nft.setDiscountOperator(await owner.getAddress());
    await nft.setMonthlyLimit(LVL_LEGENDARY, 2);
    await nft.mint(alice.address, 10, "ipfs://l1");
    await nft.mint(alice.address, 10, "ipfs://l2");
    await expect(
      nft.mint(alice.address, 10, "ipfs://l3")
    ).to.be.revertedWith("Monthly mint limit reached");
  });

  it("transfer — лимит получателя Legendary", async () => {
    await nft.setDiscountOperator(await owner.getAddress());
    await nft.setMonthlyLimit(LVL_LEGENDARY, 1);
    await nft.mint(bob.address, 10, "ipfs://direct-to-bob");
    await nft.mint(alice.address, 10, "ipfs://from-alice");
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 1)
    ).to.be.revertedWith("Recipient monthly limit reached");
  });

  it("SaleManager — лимит покупок Legendary", async () => {
    await nft.setDiscountOperator(await saleManager.getAddress());
    await nft.setMonthlyLimit(LVL_LEGENDARY, 2);
    await usdt.mint(alice.address, ethers.parseUnits("30", 8));
    await usdt.connect(alice).approve(await saleManager.getAddress(), ethers.parseUnits("30", 8));
    await saleManager.connect(alice).buyNFTWithUSDT(10, "ipfs://s1");
    await saleManager.connect(alice).buyNFTWithUSDT(10, "ipfs://s2");
    await expect(
      saleManager.connect(alice).buyNFTWithUSDT(10, "ipfs://s3")
    ).to.be.revertedWith("Monthly mint limit reached");
  });

  it("DAO — лимит наград Legendary", async () => {
    await nft.setMonthlyLimit(LVL_LEGENDARY, 2);
    await daoModule.awardNFTReward(0, alice.address, 10, "ipfs://d1");
    await daoModule.awardNFTReward(1, alice.address, 10, "ipfs://d2");
    await expect(
      daoModule.awardNFTReward(2, alice.address, 10, "ipfs://d3")
    ).to.be.revertedWith("Monthly mint limit reached");
  });

  it("Jackpot — месячный лимит не применяется", async () => {
    await nft.setMonthlyLimit(LVL_JACKPOT, 1);
    await nft.setJackpotMinter(await owner.getAddress(), true);
    await nft.mintJackpot(alice.address, 20, "ipfs://j1");
    await nft.mintJackpot(alice.address, 20, "ipfs://j2");
    await nft.mintJackpot(alice.address, 20, "ipfs://j3");
    expect(await nft.balanceOf(alice.address)).to.equal(3n);
  });
});
