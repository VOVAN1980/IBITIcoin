const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT – pause & parameter errors", () => {
  let NFT, nft, IBI, ibi, USDT, usdt;
  let owner, user;

  before(async () => {
    [owner, user] = await ethers.getSigners();
    IBI = await ethers.getContractFactory("ERC20Mock");
    USDT= await ethers.getContractFactory("ERC20Mock");
    NFT = await ethers.getContractFactory("IBITINFT");
  });

  beforeEach(async () => {
    ibi  = await IBI.deploy("IBI","IBI",owner.address,1000);
    usdt = await USDT.deploy("USD","USD",owner.address,1000);
    nft  = await NFT.deploy("X","X", 10, 20, 100, 5, ibi.target);
  });

  it("purchaseNFTWithUSDT до setUSDTParameters → revert", async () => {
    await expect(
      nft.connect(user).purchaseNFTWithUSDT("uri")
    ).to.be.revertedWith("USDT token not set");
  });

  it("purchaseNFT и purchaseNFTWithUSDT когда paused → revert", async () => {
    // настроим USDT до паузы
    await nft.setUSDTParameters(usdt.target, 10);
    await nft.pause();
    await expect(nft.purchaseNFT("uri")).to.be.revertedWith("Pausable: paused");
    await expect(nft.purchaseNFTWithUSDT("uri")).to.be.revertedWith("Pausable: paused");;
  });

  it("конструктор возвращает корректные параметры initial state", async () => {
    expect(await nft.name()).to.equal("X");
    expect(await nft.symbol()).to.equal("X");
  });
});
