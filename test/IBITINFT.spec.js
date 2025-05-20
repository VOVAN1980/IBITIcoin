const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT – comprehensive tests", function () {
  let ibitiNFT, ibitiToken, usdtToken;
  let owner, alice, bob;

  const NAME            = "IBITI NFT";
  const SYMBOL          = "IBINFT";
  const INITIAL_SUPPLY  = ethers.parseEther("1000000");
  const PRICE_IBITI     = ethers.parseEther("10");
  const PRICE_USDT      = ethers.parseUnits("20", 6);
  const GROWTH_RATE     = 150; // 1.5%
  const SALES_THRESHOLD = 2;
  const URI1            = "ipfs://QmURI1";
  const URI2            = "ipfs://QmURI2";
  const NEW_URI         = "ipfs://QmNEW";
  const INTERVAL        = 30 * 24 * 3600;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibitiToken = await ERC20Mock.deploy(
      "MockIBITI", "mIBI", owner.address, INITIAL_SUPPLY
    );
    await ibitiToken.waitForDeployment();

    usdtToken = await ERC20Mock.deploy(
      "MockUSDT", "mUSDT", owner.address, INITIAL_SUPPLY
    );
    await usdtToken.waitForDeployment();

    // Deploy IBITINFT contract
    const IBITINFT = await ethers.getContractFactory("IBITINFT");
    ibitiNFT = await IBITINFT.deploy(
      NAME,
      SYMBOL,
      PRICE_IBITI,
      PRICE_USDT,
      GROWTH_RATE,
      SALES_THRESHOLD,
      ibitiToken.target
    );
    await ibitiNFT.waitForDeployment();

    // Configure USDT
    await ibitiNFT.connect(owner).setUSDTParameters(
      usdtToken.target,
      PRICE_USDT
    );
  });

  describe("constructor & initial state", function () {
    it("sets parameters correctly", async function () {
      expect(await ibitiNFT.nftPrice()).to.equal(PRICE_IBITI);
      expect(await ibitiNFT.nftPriceUSDT()).to.equal(PRICE_USDT);
      expect(await ibitiNFT.priceGrowthRate()).to.equal(GROWTH_RATE);
      expect(await ibitiNFT.salesThreshold()).to.equal(SALES_THRESHOLD);
    });
  });

  describe("purchaseNFT (IBITI)", function () {
    it("reverts on empty URI", async function () {
      await expect(
        ibitiNFT.connect(alice).purchaseNFT("")
      ).to.be.revertedWith("Empty tokenURI");
    });

    it("reverts on duplicate URI", async function () {
      await ibitiToken.transfer(alice.address, PRICE_IBITI * 2n);
      await ibitiToken.connect(alice).approve(
        ibitiNFT.target,
        PRICE_IBITI * 2n
      );
      await ibitiNFT.connect(alice).purchaseNFT(URI1);
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      ).to.be.revertedWith("URI already used");
    });

    it("mints and emits NFTPurchased event", async function () {
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(
        ibitiNFT.target,
        PRICE_IBITI
      );
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      )
        .to.emit(ibitiNFT, "NFTPurchased")
        .withArgs(alice.address, 0, PRICE_IBITI, ibitiToken.target);
      expect(await ibitiNFT.ownerOf(0)).to.equal(alice.address);
    });

    it("reverts on payment failure", async function () {
      // no approve
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      ).to.be.revertedWith("Payment failed");
    });

    it("respects pause state", async function () {
      await ibitiNFT.connect(owner).pause();
      await expect(
        ibitiNFT.connect(alice).purchaseNFT(URI1)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("purchaseNFTWithUSDT", function () {
    it("reverts on empty URI", async function () {
      await expect(
        ibitiNFT.connect(bob).purchaseNFTWithUSDT("")
      ).to.be.revertedWith("Empty tokenURI");
    });

    it("reverts when USDT not configured", async function () {
      const IBITINFT = await ethers.getContractFactory("IBITINFT");
      const fresh = await IBITINFT.deploy(
        NAME, SYMBOL,
        PRICE_IBITI, PRICE_USDT,
        GROWTH_RATE, SALES_THRESHOLD,
        ibitiToken.target
      );
      await fresh.waitForDeployment();

      await usdtToken.transfer(bob.address, PRICE_USDT);
      await usdtToken.connect(bob).approve(
        fresh.target,
        PRICE_USDT
      );
      await expect(
        fresh.connect(bob).purchaseNFTWithUSDT(URI1)
      ).to.be.revertedWith("USDT token not set");
    });

    it("mints and emits NFTPurchased event", async function () {
      await usdtToken.transfer(bob.address, PRICE_USDT);
      await usdtToken.connect(bob).approve(
        ibitiNFT.target,
        PRICE_USDT
      );
      await expect(
        ibitiNFT.connect(bob).purchaseNFTWithUSDT(URI2)
      )
        .to.emit(ibitiNFT, "NFTPurchased")
        .withArgs(bob.address, 0, PRICE_USDT, usdtToken.target);
      expect(await ibitiNFT.ownerOf(0)).to.equal(bob.address);
    });

    it("reverts on payment failure", async function () {
      await usdtToken.transfer(bob.address, PRICE_USDT);
      // no approve
      await expect(
        ibitiNFT.connect(bob).purchaseNFTWithUSDT(URI2)
      ).to.be.revertedWith("Payment failed");
    });
  });

  describe("updateNFTPriceMonthly", function () {
    it("reverts before interval", async function () {
      await expect(
        ibitiNFT.updateNFTPriceMonthly()
      ).to.be.revertedWith("Update not allowed yet");
    });

    it("reverts when threshold zero", async function () {
      const IBITINFT = await ethers.getContractFactory("IBITINFT");
      const fresh = await IBITINFT.deploy(
        NAME, SYMBOL,
        PRICE_IBITI, PRICE_USDT,
        GROWTH_RATE, 0,
        ibitiToken.target
      );
      await fresh.waitForDeployment();
      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await expect(
        fresh.updateNFTPriceMonthly()
      ).to.be.revertedWith("Sales threshold not set");
    });

    it("increases price when threshold met", async function () {
      await ibitiToken.transfer(alice.address, PRICE_IBITI * 2n);
      await ibitiToken.connect(alice).approve(
        ibitiNFT.target,
        PRICE_IBITI * 2n
      );
      await ibitiNFT.connect(alice).purchaseNFT(URI1);
      await ibitiNFT.connect(alice).purchaseNFT(URI2);
      await ethers.provider.send("evm_increaseTime", [INTERVAL + 1]);
      await ibitiNFT.updateNFTPriceMonthly();
      const expected = PRICE_IBITI * BigInt(GROWTH_RATE + 10000) / 10000n;
      expect(await ibitiNFT.nftPrice()).to.equal(expected);
      expect(await ibitiNFT.totalNFTPurchasesThisMonth()).to.equal(0);
    });
  });

  describe("updateNFT (burn & mint)", function () {
    beforeEach(async function () {
      await ibitiToken.transfer(alice.address, PRICE_IBITI);
      await ibitiToken.connect(alice).approve(
        ibitiNFT.target,
        PRICE_IBITI
      );
      await ibitiNFT.connect(alice).purchaseNFT(URI1);
    });

    it("reverts on invalid tokenId", async function () {
      await expect(
        ibitiNFT.updateNFT(999, NEW_URI)
      ).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("reverts on duplicate new URI", async function () {
      await ibitiNFT.updateNFT(0, NEW_URI);
      await expect(
        ibitiNFT.updateNFT(1, NEW_URI)
      ).to.be.revertedWith("New URI already used");
    });

    it("updates metadata and emits NFTUpdated event", async function () {
      await ethers.provider.send("evm_increaseTime", [10]);
      const converted = "https://dweb.link/ipfs/" + NEW_URI.slice(7);
      await expect(
        ibitiNFT.updateNFT(0, NEW_URI)
      )
        .to.emit(ibitiNFT, "NFTUpdated")
        .withArgs(0, 1, converted);
      expect(await ibitiNFT.tokenURI(1)).to.equal(converted);
      await expect(ibitiNFT.ownerOf(0)).to.be.revertedWith("ERC721: invalid token ID");
    });
  });
});