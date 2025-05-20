const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT Missing Branch Coverage", function () {
  let owner, user, other;
  let IBITINFT, nft;
  let ibitiToken, usdtToken;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    // Deploy mock IBITI token
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibitiToken = await ERC20Mock.deploy(
      "IBITI", "IBI", owner.address, ethers.parseUnits("1000", 8)
    );
    await ibitiToken.waitForDeployment();

    // Deploy IBITINFT with initial parameters
    IBITINFT = await ethers.getContractFactory("IBITINFT");
    nft = await IBITINFT.deploy(
      "MyNFT", "MNFT",
      50,    // nftPrice in IBI
      100,   // nftPriceUSDT in USDT units
      200,   // priceGrowthRate (2%)
      3,     // salesThreshold
      ibitiToken.target
    );
    await nft.waitForDeployment();

    // Provide user with IBITI and approve
    await ibitiToken.transfer(user.address, ethers.parseUnits("100", 8));
    await ibitiToken.connect(user).approve(nft.target, ethers.parseUnits("100", 8));

    // Deploy USDT mock and configure
    usdtToken = await ERC20Mock.deploy(
      "USDT", "USDT", owner.address, ethers.parseUnits("1000", 8)
    );
    await usdtToken.waitForDeployment();
    await nft.setUSDTParameters(usdtToken.target, 100);
    await usdtToken.transfer(user.address, ethers.parseUnits("200", 8));
    await usdtToken.connect(user).approve(nft.target, ethers.parseUnits("200", 8));
  });

  it("reverts purchaseNFT when empty URI", async function () {
    await expect(
      nft.connect(user).purchaseNFT("")
    ).to.be.revertedWith("Empty tokenURI");
  });

  it("reverts purchaseNFT on duplicate URI", async function () {
    const uri = "dup-uri";
    await nft.connect(user).purchaseNFT(uri);
    await expect(
      nft.connect(user).purchaseNFT(uri)
    ).to.be.revertedWith("URI already used");
  });

  it("allows purchaseNFT with IBITI and emits event", async function () {
    const uri = "unique1";
    const price = await nft.nftPrice();
    await expect(
      nft.connect(user).purchaseNFT(uri)
    )
      .to.emit(nft, "NFTPurchased")
      .withArgs(user.address, 0, price, ibitiToken.target);
    expect(await nft.ownerOf(0)).to.equal(user.address);
  });

  it("reverts purchaseNFTWithUSDT when paused or token unset", async function () {
    const uri = "uri2";
    // Paused state
    await nft.pause();
    await expect(
      nft.connect(user).purchaseNFTWithUSDT(uri)
    ).to.be.revertedWith("Pausable: paused");
    await nft.unpause();

    // Fresh instance without USDT parameters
    const fresh = await IBITINFT.deploy(
      "F", "F", 50, 100, 200, 3, ibitiToken.target
    );
    await fresh.waitForDeployment();
    await expect(
      fresh.connect(user).purchaseNFTWithUSDT(uri)
    ).to.be.revertedWith("USDT token not set");
  });

  it("updates price only after threshold and interval, resets counter when not met", async function () {
    // One sale (< threshold)
    await nft.connect(user).purchaseNFT("a");

    // Advance time < 30 days
    await ethers.provider.send("evm_increaseTime", [15 * 24 * 3600]);
    await ethers.provider.send("evm_mine");
    await expect(
      nft.updateNFTPriceMonthly()
    ).to.be.revertedWith("Update not allowed yet");

    // Advance time > 30 days, sales still < threshold
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine");
    const oldPrice = await nft.nftPrice();
    // Price should not change but event is always emitted
    await expect(nft.updateNFTPriceMonthly()).to.emit(nft, "PriceParametersUpdated");
    expect(await nft.nftPrice()).to.equal(oldPrice);
  });

  it("updates NFT URI correctly, burns old token, preserves owner", async function () {
    const uriOld = "old";
    const uriNew = "new";
    await nft.connect(user).purchaseNFT(uriOld);
    const tokenId = 0;

    // Invalid tokenId should revert with ERC721 error
    await expect(
      nft.updateNFT(99, uriNew)
    ).to.be.revertedWith("ERC721: invalid token ID");

    // Duplicate URI should revert with new-specific message
    await expect(
      nft.updateNFT(tokenId, uriOld)
    ).to.be.revertedWith("New URI already used");

    // Successful update
    await expect(nft.updateNFT(tokenId, uriNew)).to.emit(nft, "NFTUpdated");
    // Old token burned
    await expect(nft.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID");
    // New token retains owner
    expect(await nft.ownerOf(1)).to.equal(user.address);
  });
});
