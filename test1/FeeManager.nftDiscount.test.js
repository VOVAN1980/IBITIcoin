const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – nftDiscount ≥ 100 → fee == 0", function () {
  let feeManager, token, owner;

  before(async () => {
    [owner] = await ethers.getSigners();

    // 1) Mock-ERC20 как tokenContract (decimals = 8)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "TKN", "TKN",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await token.waitForDeployment();

    // 2) Деплой FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();
  });

  it("должен возвращать 0, когда nftDiscount = 100", async () => {
    const fee = await feeManager.calculateFee(
      ethers.ZeroAddress,        // _user (не используется)
      ethers.parseUnits("1", 8), // amount (1 token at 10^8 decimals)
      false,                     // isBuy
      false,                     // stakingActive
      false,                     // isVIP
      false,                     // isWhale
      0,                         // holdingDuration
      100                        // nftDiscount
    );
    expect(fee).to.equal(0n);
  });
});
