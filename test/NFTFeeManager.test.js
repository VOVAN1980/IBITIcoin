const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount – core functionality", function () {
  let owner, user, operator, dao, staking;
  let payToken, nft;
  const INITIAL_SUPPLY = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [owner, user, operator, dao, staking] = await ethers.getSigners();

    // Deploy ERC20Mock as payment token
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    payToken = await ERC20Mock.deploy(
      "PayToken", "PAY", owner.address,
      INITIAL_SUPPLY
    );
    await payToken.waitForDeployment();

    // Deploy NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nft = await NFTDiscount.deploy();
    await nft.waitForDeployment();

    // Configure roles and modules
    await nft.setDiscountOperator(operator.address);
    await nft.setDAOModule(dao.address);
    await nft.setStakingModule(staking.address);
  });

  it("allows owner to mint with valid discount percent and converts URI", async function () {
    const uri = "ipfs://Qm123";
    await expect(nft.mint(user.address, 10, uri))
      .to.emit(nft, "NFTMinted")
      .withArgs(user.address, 0, 10, 2);

    expect(await nft.tokenURI(0)).to.equal(
      "https://dweb.link/ipfs/Qm123"
    );
  });

  it("reverts mint for unsupported discount percent", async function () {
    await expect(
      nft.mint(user.address, 2, "ipfs://A")
    ).to.be.revertedWith("Invalid discount percent");
  });

  it("toggles jackpot minter and allows jackpot minting", async function () {
    await expect(nft.setJackpotMinter(operator.address, true))
      .to.emit(nft, "JackpotMinterSet")
      .withArgs(operator.address, true);
    expect(await nft.jackpotMinters(operator.address)).to.be.true;

    const juri = "ipfs://JACK";
    await expect(
      nft.connect(operator).mintJackpot(user.address, 5, juri)
    ).to.emit(nft, "NFTMintedJackpot").withArgs(user.address, 0, 5);
  });

  it("updates NFT and preserves original data", async function () {
    await nft.mint(user.address, 3, "ipfs://OLD");
    const original = await nft.discountData(0);

    await expect(
      nft.updateNFT(0, "ipfs://NEWURI")
    ).to.emit(nft, "NFTUpdated").withArgs(0, 1, "ipfs://NEWURI");

    const updated = await nft.discountData(1);
    expect(updated.discountPercent).to.equal(original.discountPercent);
    expect(updated.level).to.equal(original.level);
  });

  it("rescues ERC20 tokens to owner", async function () {
    const amt = ethers.parseUnits("10", 18);
    await payToken.transfer(nft.target, amt);

    await expect(
      nft.rescueERC20(payToken.target, amt)
    ).to.emit(nft, "TokensRescued").withArgs(
      payToken.target,
      amt
    );
    expect(await payToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
  });
});
