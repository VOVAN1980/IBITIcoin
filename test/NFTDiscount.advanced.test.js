const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – advanced behaviors", function () {
  let deployer, user;
  let usdt, ibiti, NFTDiscount, nft;
  const PRICE = ethers.parseUnits("10", 18);

  before(async () => {
    [deployer, user] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const initialBalance = ethers.parseUnits("1000", 18);

    usdt  = await ERC20Mock.connect(deployer).deploy("USDT", "USDT", user.address, initialBalance);
    ibiti = await ERC20Mock.connect(deployer).deploy("IBITI", "IBI", user.address, initialBalance);

    const NFTDiscountFactory = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscountFactory.connect(deployer).deploy();

    await nft.setPayToken(usdt.getAddress());
    await nft.setIbitiToken(ibiti.getAddress());
    await nft.setNftPrice(PRICE);
    await nft.setDiscountOperator(deployer.address);
  });

  it("Pandora mint and use 10 times before reset", async () => {
    const uri = "ipfs://pandora-test";
    await nft.connect(deployer).mintPandora(user.address, uri);
    expect(await nft.tokenURI(0)).to.equal("https://dweb.link/ipfs/pandora-test");

    for (let i = 0; i < 10; i++) {
      await nft.connect(user).usePandora(0);
    }

    await expect(nft.connect(user).usePandora(0)).to.be.revertedWith("Usage limit reached");
  });

  it("Jackpot mint by operator and consume", async () => {
    const uri = "ipfs://jackpot-test";
    await nft.setJackpotMinter(deployer.address, true);
    await nft.connect(deployer).mintJackpot(user.address, 3, uri);

    const data = await nft.discountData(0);
    expect(data.discountPercent).to.equal(3);
    expect(data.level).to.equal(5); // Jackpot

    await expect(nft.connect(user).useDiscount(0))
      .to.emit(nft, "NFTUsed")
      .withArgs(user.address, 0, 3);

    await expect(nft.ownerOf(0)).to.be.reverted; // already burned
  });

  it("Reject transfer of Jackpot NFT", async () => {
    const uri = "ipfs://jackpot2";
    await nft.setJackpotMinter(deployer.address, true);
    await nft.connect(deployer).mintJackpot(user.address, 3, uri);

    await expect(nft.connect(user).transferFrom(user.address, deployer.address, 0))
      .to.be.revertedWith("Jackpot NFTs are non-transferable");
  });

  it("Pause blocks all minting", async () => {
    await nft.pause();
    await expect(nft.connect(user).buyDiscountNFTForUSDT(1, "ipfs://paused"))
      .to.be.revertedWith("Contract is paused");
  });

  it("Enforces monthly mint limit", async () => {
    const uriBase = "ipfs://batch";
    await nft.setMonthlyLimit(0, 2); // Normal

    for (let i = 0; i < 2; i++) {
      const uri = uriBase + i;
      await usdt.connect(user).approve(nft.getAddress(), PRICE);
      await nft.connect(user).buyDiscountNFTForUSDT(1, uri);
    }

    await usdt.connect(user).approve(nft.getAddress(), PRICE);
    await expect(nft.connect(user).buyDiscountNFTForUSDT(1, "ipfs://over"))
      .to.be.revertedWith("Monthly mint limit reached");
  });
});