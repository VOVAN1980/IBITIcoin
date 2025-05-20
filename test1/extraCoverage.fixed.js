const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Extra Coverage Tests", function () {
  let buyer, other;
  let token, nftDiscount, staking, malicious, oracle, ibiToken, ibitiNft;

  before(async function () {
    [buyer, other] = await ethers.getSigners();

    // 1) ERC20Mock
    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20.deploy(
      "TKN",
      "TKN",
      buyer.address,
      ethers.parseUnits("1000", 8)
    );
    await token.waitForDeployment();

    // 2) NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 3) StakingModule (only token.address may call)
    const Staking = await ethers.getContractFactory("StakingModule");
    staking = await Staking.deploy(token.target, nftDiscount.target);
    await staking.waitForDeployment();
    // note: setAllowedCaller no longer exists

    // 4) MaliciousToken
    const Malicious = await ethers.getContractFactory("MaliciousToken");
    malicious = await Malicious.deploy(staking.target);
    await malicious.waitForDeployment();

    // 5) VolumeWeightedOracle
    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(18);
    await oracle.waitForDeployment();

    // 6) ERC20Mock for IBI
    ibiToken = await ERC20.deploy(
      "IBI",
      "IBI",
      buyer.address,
      ethers.parseUnits("1000", 8)
    );
    await ibiToken.waitForDeployment();

    // 7) IBITINFT
    const IBITINFT = await ethers.getContractFactory("IBITINFT");
    ibitiNft = await IBITINFT.deploy(
      "NFT",                           // name
      "NFT",                           // symbol
      ethers.parseUnits("1", 8),       // nftPrice
      ethers.parseUnits("1", 8),       // nftPriceUSDT
      0,                               // growthRate
      1,                               // salesThreshold
      ibiToken.target                  // ibiti token address
    );
    await ibitiNft.waitForDeployment();
  });

  describe("StakingModule – direct calls restricted", function () {
    it("reverts any direct stakeTokensFor invocation", async function () {
      // All direct calls should revert with Only token contract
      await expect(
        staking.stakeTokensFor(buyer.address, ethers.parseUnits("1", 8), 1)
      ).to.be.revertedWith("Only token contract");

      await expect(
        staking.stakeTokensFor(buyer.address, ethers.parseUnits("1", 8), 5)
      ).to.be.revertedWith("Only token contract");
    });
  });

  describe("VolumeWeightedOracle edge cases", function () {
    it("returns 0 price when no pools or zero reserves", async function () {
      expect(await oracle.getPrice()).to.equal(0);
    });
  });

  describe("MaliciousToken functionality", function () {
    it("setStaking updates internal address", async function () {
      await malicious.setStaking(other.address);
      expect(await malicious.staking()).to.equal(other.address);
    });

    it("transferFrom reverts to prevent reentrancy", async function () {
      const amt = ethers.parseUnits("10", 8);
      await malicious.connect(buyer).approve(other.address, amt);
      await expect(
        malicious.connect(other).transferFrom(
          buyer.address,
          other.address,
          amt
        )
      ).to.be.reverted;
    });
  });

  describe("IBITINFT error branches", function () {
    it("purchaseNFT reverts on payment failure", async function () {
      await expect(
        ibitiNft.connect(other).purchaseNFT("ipfs://fail")
      ).to.be.revertedWith("Payment failed");
    });

    it("updateNFT reverts on invalid tokenId", async function () {
      await expect(
        ibitiNft.updateNFT(999, "uri")
      ).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("updateNFT reverts on duplicate URI", async function () {
      await ibiToken.connect(buyer).approve(
        ibitiNft.target,
        ethers.parseUnits("1", 8)
      );
      await ibitiNft.connect(buyer).purchaseNFT("ipfs://A");
      await expect(
        ibitiNft.updateNFT(0, "ipfs://A")
      ).to.be.revertedWith("New URI already used");
    });

    it("https URI remains unchanged after purchaseNFT", async function () {
      await ibiToken.connect(buyer).approve(
        ibitiNft.target,
        ethers.parseUnits("1", 8)
      );
      await ibitiNft.connect(buyer).purchaseNFT("https://x.json");
      expect(await ibitiNft.tokenURI(1)).to.equal("https://x.json");
    });
  });

  describe("NFTDiscount utility branches", function () {
    it("https:// URI unchanged in mint", async function () {
      await nftDiscount.mint(buyer.address, 1, "https://foo/bar");
      expect(await nftDiscount.tokenURI(0)).to.equal("https://foo/bar");
    });

    it("discountOperator can call useDiscountFor", async function () {
      await nftDiscount.mint(buyer.address, 1, "ipfs://hashA");
      await nftDiscount.setDiscountOperator(buyer.address);
      await expect(
        nftDiscount.useDiscountFor(buyer.address, 0)
      ).to.not.be.reverted;
    });
  });

  describe("FeeManager nftDiscount ≥ 100 branch", function () {
    it("calculateFee returns 0 when discount ≥ 100", async function () {
      const FeeManager = await ethers.getContractFactory("FeeManager");
      const feeMgr = await FeeManager.deploy(token.target);
      await feeMgr.waitForDeployment();
      expect(
        await feeMgr.calculateFee(
          buyer.address,
          ethers.parseUnits("1", 8),
          false,
          false,
          false,
          false,
          0,
          100
        )
      ).to.equal(0);
    });
  });
});
