/*  test/NFTDiscount.edge.test.js
    Edge‑ветви для NFTDiscount.sol                                  */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – edge branches", () => {
  let nft, owner, alice, bob, operator;
  const DAY = 24 * 60 * 60;
  const MONTH = 30 * DAY;

  const warp = async s => {
    await ethers.provider.send("evm_increaseTime", [s]);
    await ethers.provider.send("evm_mine");
  };

  before(async () => {
    [owner, alice, bob, operator] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();
    await nft.setDiscountOperator(operator.address);
  });

  /* ───────────── 1. auto‑burn ───────────── */
  it("Normal NFT auto‑burn: transferFrom ревертит после 30 дней", async () => {
    await nft.mint(alice.address, 1, "uri#1");   // tokenId 0
    await warp(MONTH + DAY);
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 0)
    ).to.be.revertedWith("ERC721: invalid token ID");
  });

  /* ───────────── 2. disabled cooldown ───────────── */
  it("transfer allowed immediately (cooldown disabled)", async () => {
    await nft.mint(alice.address, 1, "uri#2");   // tokenId 0
    // Immediately transferrable
    await nft.connect(alice).transferFrom(alice.address, bob.address, 0);
    expect(await nft.ownerOf(0)).to.equal(bob.address);
  });

  /* ───────────── 3. Jackpot non‑transferable ───────────── */
  it("Jackpot NFT не передаётся", async () => {
    await nft.mintJackpot(alice.address, 3, "jackpot#1"); // tokenId 0
    await expect(
      nft.connect(alice).transferFrom(alice.address, bob.address, 0)
    ).to.be.revertedWith("Jackpot NFTs are non-transferable");
  });

  /* ───────────── 4. monthly mint‑limit reset ───────────── */
  it("monthly mint‑limit сбрасывается через 30 дней", async () => {
    // исчерпываем лимит Normal = 10
    for (let i = 0; i < 10; i++) {
      await nft.mint(alice.address, 1, `u#${i}`);
    }
    await expect(
      nft.mint(alice.address, 1, "u#overflow")
    ).to.be.revertedWith("Monthly mint limit reached");

    await warp(MONTH + DAY);

    // после сброса можно снова минтить
    await nft.mint(alice.address, 1, "u#afterReset");
    const levelNormal = 0; // enum value
    const cnt = await nft.monthlyMintCount(alice.address, levelNormal);
    expect(cnt).to.equal(1);
  });

  /* ───────────── 5. discountOperator.useDiscountFor ───────────── */
  it("discountOperator может использовать NFT пользователя", async () => {
    await nft.mint(alice.address, 1, "op#1");   // tokenId 0
    await nft.connect(operator).useDiscountFor(alice.address, 0);
    await expect(nft.ownerOf(0)).to.be.revertedWith("ERC721: invalid token ID");
  });
});
