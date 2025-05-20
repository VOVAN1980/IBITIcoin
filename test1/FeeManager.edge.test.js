/*  test/FeeManager.edge.test.js
    Добиваем 100 % branch-coverage FeeManager.sol                              */

const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { parseUnits } = ethers;

describe("FeeManager – edge branches", () => {
  let token, feeM;
  let owner, outsider;

  beforeEach(async () => {
    [owner, outsider] = await ethers.getSigners();

    // минимальный ERC20 mock с 8 decimals
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("IBI", "IBI", owner.address, 0);
    await token.waitForDeployment();

    // FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeM = await FeeManager.deploy(token.target);
    await feeM.waitForDeployment();

    // разрешаем owner вызывать updateActivity
    await feeM.setTokenContract(owner.address);
  });

  it("calculateFee со всеми скидками/наценками и NFT-discount", async () => {
    const ONE = parseUnits("1", 8);
    const amount = ONE * 100n;

    const fee = await feeM.calculateFee(
      ethers.ZeroAddress,
      amount,
      false,      // sell
      true,       // stakingActive
      true,       // isVIP
      true,       // isWhale
      61 * 24 * 60 * 60,
      20          // nftDiscount
    );
    expect(fee).to.equal(parseUnits("6.4", 8));
  });

  it("кламп выше maxFee и ниже minFee", async () => {
    await feeM.setMinFee(parseUnits("1", 8));   // 1 IBI
    await feeM.setMaxFee(parseUnits("5", 8));   // 5 IBI

    // sell: 10% от 1000 = 100 → clamp к maxFee = 5
    const feeHigh = await feeM.calculateFee(
      ethers.ZeroAddress,
      parseUnits("1000", 8),
      false, false, false, false, 0, 0
    );
    expect(feeHigh).to.equal(parseUnits("5", 8));

    // sell: 10% от 1 = 0.1 < minFee → clamp к minFee = 1
    const feeLow = await feeM.calculateFee(
      ethers.ZeroAddress,
      parseUnits("1", 8),
      false, false, false, false, 0, 0
    );
    expect(feeLow).to.equal(parseUnits("1", 8));
  });

  it("auditParameters применяет tier-волатильность", async () => {
    const tiers = [
      { volumeThreshold: parseUnits("10", 8), volatilityValue: 120 },
      { volumeThreshold: parseUnits("100", 8), volatilityValue: 150 },
    ];
    await feeM.setVolatilityTiers(tiers);

    await feeM.updateActivity(owner.address, parseUnits("15", 8), true);
    await feeM.autoAdjustVolatilityCoefficient();
    expect(await feeM.volatilityCoefficient()).to.equal(120);

    await feeM.updateActivity(owner.address, parseUnits("100", 8), true);
    await feeM.autoAdjustVolatilityCoefficient();
    expect(await feeM.volatilityCoefficient()).to.equal(150);
  });

  it("updateActivity: outsider → revert, tokenContract → success", async () => {
    await expect(
      feeM.connect(outsider).updateActivity(outsider.address, 1, true)
    ).to.be.revertedWith("Only token contract");
    await expect(
      feeM.updateActivity(owner.address, 1, true)
    ).to.not.be.reverted;
  });
});
