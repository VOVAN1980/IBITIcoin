const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – update, rescue, voting, operator", function () {
  let deployer, user;
  let token, NFTDiscount, nft;
  const PRICE = ethers.parseUnits("10", 18);

  before(async () => {
    [deployer, user] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const initialBalance = ethers.parseUnits("1000", 18);

    token = await ERC20Mock.connect(deployer).deploy("TEST", "TST", user.address, initialBalance);

    const NFTDiscountFactory = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscountFactory.connect(deployer).deploy();

    await nft.setPayToken(token.getAddress());
    await nft.setNftPrice(PRICE);
    await nft.setDiscountOperator(deployer.address);
  });

  it("updateNFT burns old and mints new with same data", async () => {
    const oldURI = "ipfs://olduri";
    const newURI = "ipfs://newuri";

    await token.connect(user).approve(nft.getAddress(), PRICE);
    await nft.connect(user).buyDiscountNFTForUSDT(1, oldURI);

    await nft.connect(deployer).updateNFT(0, newURI);

    await expect(nft.ownerOf(0)).to.be.reverted; // old is burned
    expect(await nft.tokenURI(1)).to.equal("https://dweb.link/ipfs/newuri");
  });

  it("rescueERC20 sends tokens back to owner", async () => {
    await token.connect(user).transfer(nft.getAddress(), ethers.parseUnits("50", 18));
    const balBefore = await token.balanceOf(deployer.address);
    await nft.connect(deployer).rescueERC20(token.getAddress(), ethers.parseUnits("50", 18));
    const balAfter = await token.balanceOf(deployer.address);
    expect(balAfter - balBefore).to.equal(ethers.parseUnits("50", 18));
  });

  it("awardVotingRewards mints correct NFTs", async () => {
    const baseURI = "ipfs://reward";
    await nft.setDAOModule(deployer.address);

    const winners = [user.address];
    const losers = [user.address];

    await nft.connect(deployer).awardVotingRewards(winners, losers, baseURI);
    expect(await nft.balanceOf(user.address)).to.equal(4);
  });

  it("useDiscountFor works from operator", async () => {
    const uri = "ipfs://use-op";
    await token.connect(user).approve(nft.getAddress(), PRICE);
    await nft.connect(user).buyDiscountNFTForUSDT(1, uri);

    await expect(nft.connect(deployer).useDiscountFor(user.address, 0))
      .to.emit(nft, "NFTUsed")
      .withArgs(user.address, 0, 1);
  });
});