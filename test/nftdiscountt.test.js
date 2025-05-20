// test/nftdiscountt.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – expiration burn & invalid discount", function () {
  let owner, user, nft;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();
    // DAO-модуль нужен, чтобы mint() работал
    await nft.connect(owner).setDAOModule(owner.address);
  });

  it("burns expired Normal NFT on useDiscount", async function () {
    // mint 1% → Normal
    await nft.connect(owner).mint(user.address, 1, "ipfs://expired");
    const tokenId = 0;
    // warp за 31 день
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine", []);
    // useDiscount должно откатиться с истечением срока
    await expect(
      nft.connect(user).useDiscount(tokenId)
    ).to.be.revertedWith("Discount NFT expired");
  });

  it("reverts mint with invalid discount percent", async function () {
    await expect(
      nft.connect(owner).mint(user.address, 2, "ipfs://badpct")
    ).to.be.revertedWith("Invalid discount percent");
  });

  it("reverts awardVotingRewards if too soon", async function () {
    // первый вызов проходит
    await nft
      .connect(owner)
      .awardVotingRewards([user.address], [], "ipfs://base");
    // повторный сразу – revert
    await expect(
      nft
        .connect(owner)
        .awardVotingRewards([user.address], [], "ipfs://base2")
    ).to.be.revertedWith("Voting rewards already awarded this month");
  });
});
