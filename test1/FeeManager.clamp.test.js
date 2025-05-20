const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – clamp & nftDiscount coverage", () => {
  let feeManager, token, owner, user;

  before(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("FEE", "FEE", owner.address, 0);
    await token.waitForDeployment();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(token.target);
    await feeManager.waitForDeployment();

    await feeManager.setTokenContract(owner.address);
  });

  it("should return 0 fee if nftDiscount ≥ 100 (line 89)", async () => {
    const fee = await feeManager.calculateFee(
      user.address,
      ethers.parseUnits("1000", 8),
      false,   // isBuy
      false,   // staking
      false,   // VIP
      false,   // whale
      0,       // holdingDuration
      100      // nftDiscount
    );
    expect(fee).to.equal(0);
  });

  it("should clamp fee to minFee (line 290)", async () => {
    await feeManager.setBaseSellFee(1); // 1%
    await feeManager.setMinFee(ethers.parseUnits("5", 8)); // мин. 5 IBI
    await feeManager.setMaxFee(ethers.parseUnits("100", 8));

    const fee = await feeManager.calculateFee(
      user.address,
      ethers.parseUnits("1", 8),  // очень маленький объём → fee будет < min
      false,
      false,
      false,
      false,
      0,
      0
    );
    expect(fee).to.equal(ethers.parseUnits("5", 8));
  });

  it("should clamp fee to maxFee (line 291)", async () => {
    await feeManager.setBaseSellFee(50); // 50%
    await feeManager.setMinFee(0);
    await feeManager.setMaxFee(ethers.parseUnits("10", 8)); // максимум

    const fee = await feeManager.calculateFee(
      user.address,
      ethers.parseUnits("1000", 8), // огромный объём → fee > max
      false,
      false,
      false,
      false,
      0,
      0
    );
    expect(fee).to.equal(ethers.parseUnits("10", 8));
  });
});
