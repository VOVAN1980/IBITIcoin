const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – purchase flows", function () {
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
  });

  it("USDT → Normal (pct=1)", async () => {
    const uri = "ipfs://normal";
    await usdt.connect(user).approve(nft.getAddress(), PRICE);
    await expect(nft.connect(user).buyDiscountNFTForUSDT(1, uri))
      .to.emit(nft, "NFTMinted")
      .withArgs(user.address, 0, 1, 0);
    expect(await nft.tokenURI(0)).to.equal("https://dweb.link/ipfs/normal");
  });

  it("USDT → Rare (pct=5)", async () => {
    const uri = "ipfs://rare";
    await usdt.connect(user).approve(nft.getAddress(), PRICE);
    await expect(nft.connect(user).buyDiscountNFTForUSDT(5, uri))
      .to.emit(nft, "NFTMinted")
      .withArgs(user.address, 0, 5, 1);
    expect(await nft.tokenURI(0)).to.equal("https://dweb.link/ipfs/rare");
  });

  it("IBITI → Legendary (pct=15)", async () => {
    const uri = "ipfs://legend";
    await ibiti.connect(user).approve(nft.getAddress(), PRICE);
    await expect(nft.connect(user).buyDiscountNFTForIBI(15, uri))
      .to.emit(nft, "NFTMinted")
      .withArgs(user.address, 0, 15, 2);
    expect(await nft.tokenURI(0)).to.equal("https://dweb.link/ipfs/legend");
  });

  it("IBITI → Epic (pct=75)", async () => {
    const uri = "ipfs://epic";
    await ibiti.connect(user).approve(nft.getAddress(), PRICE);
    await expect(nft.connect(user).buyDiscountNFTForIBI(75, uri))
      .to.emit(nft, "NFTMinted")
      .withArgs(user.address, 0, 75, 3);
    expect(await nft.tokenURI(0)).to.equal("https://dweb.link/ipfs/epic");
  });

  it("Revert on invalid discount percent", async () => {
    await usdt.connect(user).approve(nft.getAddress(), PRICE);
    await expect(
      nft.connect(user).buyDiscountNFTForUSDT(20, "ipfs://bad")
    ).to.be.revertedWith("Invalid discount percent");
  });

  it("Revert on duplicate URI", async () => {
    const uri = "ipfs://dup";
    await usdt.connect(user).approve(nft.getAddress(), PRICE);
    await nft.connect(user).buyDiscountNFTForUSDT(1, uri);
    await usdt.connect(user).approve(nft.getAddress(), PRICE);
    await expect(
      nft.connect(user).buyDiscountNFTForUSDT(1, uri)
    ).to.be.revertedWith("URI already used");
  });
});