const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager uncovered branches", function () {
  let token, feeManager, owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("ERC20MintableMock");
    token = await Token.deploy("USDT", "USDT");
    await token.mint(owner.address, ethers.parseUnits("1000000", 8));

    const Wrapper = await ethers.getContractFactory("FeeManagerWrapper");
    feeManager = await Wrapper.deploy(token.target);

    await feeManager.connect(owner).setBaseBuyFee(10); // ← Включаем 10% комиссию
  });

  it("should calculate correct fee [line 89]", async () => {
    const amount = ethers.parseUnits("100", 8); // 100 USDT
    const fee = await feeManager.testCalculateFee(
      user.address,
      amount,
      true,     // isBuy
      false,    // staking
      false,    // VIP
      false,    // Whale
      0,        // holding
      0         // NFT discount
    );
    expect(fee).to.equal(ethers.parseUnits("10", 8)); // 10% от 100
  });
});
