const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT – extra coverage", function () {
  let nft, ibiti, usdt, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const IBITI = await ethers.getContractFactory("ERC20Mock");
    ibiti = await IBITI.deploy("IBITIcoin", "IBI", owner.address, ethers.parseEther("100000000"));
    await ibiti.waitForDeployment();

    const USDT = await ethers.getContractFactory("ERC20Mock");
    usdt = await USDT.deploy("Tether", "USDT", owner.address, ethers.parseEther("100000000"));
    await usdt.waitForDeployment();

    const NFT = await ethers.getContractFactory("IBITINFT");
    nft = await NFT.deploy("IBITI NFT", "IBI-NFT", 100000000, 100000000, 100, 2, ibiti.target);
    await nft.waitForDeployment();

    await nft.setUSDTParameters(usdt.target, 100000000);
  });

  it("should revert on empty URI in purchaseNFT", async () => {
    await expect(nft.purchaseNFT("")).to.be.revertedWith("Empty tokenURI");
  });

  it("should revert on duplicate URI in purchaseNFT", async () => {
    await ibiti.connect(owner).transfer(user.address, ethers.parseEther("1000"));
    await ibiti.connect(user).approve(nft.target, ethers.parseEther("1000"));
    await nft.connect(user).purchaseNFT("ipfs://abc");
    await expect(nft.connect(user).purchaseNFT("ipfs://abc")).to.be.revertedWith("URI already used");
  });

  it("should revert on empty URI in purchaseNFTWithUSDT", async () => {
    await expect(nft.purchaseNFTWithUSDT("")).to.be.revertedWith("Empty tokenURI");
  });

  it("should revert on duplicate URI in purchaseNFTWithUSDT", async () => {
    await usdt.connect(owner).transfer(user.address, ethers.parseEther("1000"));
    await usdt.connect(user).approve(nft.target, ethers.parseEther("1000"));
    await nft.connect(user).purchaseNFTWithUSDT("ipfs://abc");
    await expect(nft.connect(user).purchaseNFTWithUSDT("ipfs://abc")).to.be.revertedWith("URI already used");
  });

  it("should revert on updateNFTPriceMonthly when called too early", async () => {
    await expect(nft.updateNFTPriceMonthly()).to.be.revertedWith("Update not allowed yet");
  });

  it("should revert on updateNFT when URI is already used", async () => {
    await ibiti.connect(owner).transfer(user.address, ethers.parseEther("1000"));
    await ibiti.connect(user).approve(nft.target, ethers.parseEther("1000"));
    await nft.connect(user).purchaseNFT("ipfs://used");

    const tokenId = 0;
    await expect(nft.updateNFT(tokenId, "ipfs://used")).to.be.revertedWith("New URI already used");
  });

  it("should revert updateNFT with invalid tokenId", async () => {
    await expect(nft.updateNFT(9999, "ipfs://newuri")).to.be.reverted;
  });
});
