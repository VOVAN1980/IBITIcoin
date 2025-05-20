const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT Comprehensive Tests", function () {
  let ibitiNFT, ibitiToken, usdtToken;
  let owner, alice, bob;
  const NAME            = "IBITI NFT";
  const SYMBOL          = "IBI";
  const INITIAL_IBITI   = ethers.parseEther("1000");
  const INITIAL_USDT    = ethers.parseUnits("1000", 6);
  const PRICE_IBITI     = ethers.parseEther("10");
  const PRICE_USDT      = ethers.parseUnits("20", 6);
  const GROWTH_RATE_BPS = 100; // 1%
  const SALES_THRESHOLD = 2;
  const URI1            = "ipfs://QmURI1";
  const URI2            = "ipfs://QmURI2";
  const NEW_URI         = "ipfs://QmNEW";

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy IBITI token mock
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibitiToken = await ERC20Mock.deploy(
      "IBITI Token", "IBITI", owner.address, INITIAL_IBITI
    );
    await ibitiToken.waitForDeployment();

    // Deploy USDT mock (6 decimals)
    usdtToken = await ERC20Mock.deploy(
      "USDT Token", "USDT", owner.address, INITIAL_USDT
    );
    await usdtToken.waitForDeployment();

    // Deploy IBITINFT
    const IBITINFT = await ethers.getContractFactory("IBITINFT");
    ibitiNFT = await IBITINFT.deploy(
      NAME,
      SYMBOL,
      PRICE_IBITI,
      PRICE_USDT,
      GROWTH_RATE_BPS,
      SALES_THRESHOLD,
      ibitiToken.target
    );
    await ibitiNFT.waitForDeployment();

    // Set USDT parameters
    await ibitiNFT.connect(owner).setUSDTParameters(usdtToken.target, PRICE_USDT);
  });

  describe("Constructor and initial state", () => {
    it("should set initial parameters correctly", async () => {
      expect(await ibitiNFT.nftPrice()).to.equal(PRICE_IBITI);
      expect(await ibitiNFT.nftPriceUSDT()).to.equal(PRICE_USDT);
      expect(await ibitiNFT.priceGrowthRate()).to.equal(GROWTH_RATE_BPS);
      expect(await ibitiNFT.salesThreshold()).to.equal(SALES_THRESHOLD);
    });
  });

  describe("purchaseNFT (IBITIcoin)", () => {
    it("should mint NFT and emit event", async () => {
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI);

      await expect(ibitiNFT.connect(alice).purchaseNFT(URI1))
        .to.emit(ibitiNFT, "NFTPurchased")
        .withArgs(alice.address, 0, PRICE_IBITI, ibitiToken.target);

      expect(await ibitiNFT.ownerOf(0)).to.equal(alice.address);
    });

    it("should convert ipfs URI to https", async () => {
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI);

      await ibitiNFT.connect(alice).purchaseNFT(URI1);
      expect(await ibitiNFT.tokenURI(0)).to.equal("https://dweb.link/ipfs/QmURI1");
    });

    it("should revert on empty URI", async () => {
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI);

      await expect(
        ibitiNFT.connect(alice).purchaseNFT("")
      ).to.be.revertedWith("Empty tokenURI");
    });

    it("should revert on duplicate URI", async () => {
      // Fund for two purchases
      await ibitiToken.transfer(alice.address, PRICE_IBITI * 2n);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI * 2n);

      // First purchase
      await ibitiNFT.connect(alice).purchaseNFT(URI1);

      // Second should revert
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      ).to.be.revertedWith("URI already used");
    });

    it("should revert if payment fails", async () => {
      // No approve or insufficient allowance
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      ).to.be.revertedWith("Payment failed");
    });

    it("should revert when paused", async () => {
      await ibitiNFT.connect(owner).pause();
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("purchaseNFTWithUSDT", () => {
    it("should mint NFT with USDT and emit event", async () => {
      await usdtToken.transfer(bob.address, PRICE_USDT);
      await usdtToken.connect(bob).approve(ibitiNFT.target, PRICE_USDT);

      await expect(ibitiNFT.connect(bob).purchaseNFTWithUSDT(URI2))
        .to.emit(ibitiNFT, "NFTPurchased")
        .withArgs(bob.address, 0, PRICE_USDT, usdtToken.target);

      expect(await ibitiNFT.ownerOf(0)).to.equal(bob.address);
    });

    it("should revert if USDT not set", async () => {
      // Deploy fresh without setUSDTParameters
      const IBITINFT = await ethers.getContractFactory("IBITINFT");
      const fresh = await IBITINFT.deploy(
        NAME, SYMBOL, PRICE_IBITI, PRICE_USDT, GROWTH_RATE_BPS, SALES_THRESHOLD, ibitiToken.target
      );
      await fresh.waitForDeployment();

      await usdtToken.transfer(bob.address, PRICE_USDT);
      await usdtToken.connect(bob).approve(fresh.target, PRICE_USDT);

      await expect(
        fresh.connect(bob).purchaseNFTWithUSDT(URI1)
      ).to.be.revertedWith("USDT token not set");
    });

    it("should revert on empty URI", async () => {
      await usdtToken.transfer(bob.address, PRICE_USDT);
      await usdtToken.connect(bob).approve(ibitiNFT.target, PRICE_USDT);

      await expect(
        ibitiNFT.connect(bob).purchaseNFTWithUSDT("")
      ).to.be.revertedWith("Empty tokenURI");
    });

    it("should revert on duplicate URI", async () => {
      await usdtToken.transfer(bob.address, PRICE_USDT * 2n);
      await usdtToken.connect(bob).approve(ibitiNFT.target, PRICE_USDT * 2n);

      await ibitiNFT.connect(bob).purchaseNFTWithUSDT(URI2);
      await expect(
        ibitiNFT.connect(bob).purchaseNFTWithUSDT(URI2)
      ).to.be.revertedWith("URI already used");
    });

    it("should revert if payment fails", async () => {
      await usdtToken.transfer(bob.address, PRICE_USDT);
      // no approve
      await expect(
        ibitiNFT.connect(bob).purchaseNFTWithUSDT(URI2)
      ).to.be.revertedWith("Payment failed");
    });
  });

  describe("updateNFTPriceMonthly", () => {
    it("should revert before interval", async () => {
      await expect(
        ibitiNFT.updateNFTPriceMonthly()
      ).to.be.revertedWith("Update not allowed yet");
    });

    it("should revert if salesThreshold is zero", async () => {
      // Deploy with threshold=0
      const IBITINFT = await ethers.getContractFactory("IBITINFT");
      const fresh = await IBITINFT.deploy(
        NAME, SYMBOL, PRICE_IBITI, PRICE_USDT, GROWTH_RATE_BPS, 0, ibitiToken.target
      );
      await fresh.waitForDeployment();
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await expect(
        fresh.updateNFTPriceMonthly()
      ).to.be.revertedWith("Sales threshold not set");
    });

    it("should increase price when threshold met and reset counter", async () => {
      // Two purchases to meet threshold
      await ibitiToken.transfer(alice.address, PRICE_IBITI * 2n);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI * 2n);
      await ibitiNFT.connect(alice).purchaseNFT(URI1);
      await ibitiNFT.connect(alice).purchaseNFT(URI2);

      // Fast-forward 31 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ibitiNFT.updateNFTPriceMonthly();

      // New price = PRICE_IBITI * 1.01
      const expected = PRICE_IBITI * 101n / 100n;
      expect(await ibitiNFT.nftPrice()).to.equal(expected);
      expect(await ibitiNFT.totalNFTPurchasesThisMonth()).to.equal(0);
    });

    it("should not increase price if threshold not met but reset counter", async () => {
      // One purchase < threshold
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI);
      await ibitiNFT.connect(alice).purchaseNFT(URI1);

      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
      await ibitiNFT.updateNFTPriceMonthly();

      expect(await ibitiNFT.nftPrice()).to.equal(PRICE_IBITI);
      expect(await ibitiNFT.totalNFTPurchasesThisMonth()).to.equal(0);
    });
  });

  describe("updateNFT (burn & mint)", () => {
    beforeEach(async () => {
      // Mint one NFT
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(ibitiNFT.target, PRICE_IBITI);
      await ibitiNFT.connect(alice).purchaseNFT(URI1);
    });

    it("should update NFT metadata and emit event", async () => {
      await expect(ibitiNFT.updateNFT(0, NEW_URI))
        .to.emit(ibitiNFT, "NFTUpdated")
        .withArgs(0, 1, "https://dweb.link/ipfs/QmNEW");
    });

    it("should revert on invalid tokenId", async () => {
      await expect(
        ibitiNFT.updateNFT(999, NEW_URI)
      ).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("should revert on duplicate new URI", async () => {
      await ibitiNFT.updateNFT(0, NEW_URI);
      await expect(
        ibitiNFT.updateNFT(1, NEW_URI)
      ).to.be.revertedWith("New URI already used");
    });
  });
});
