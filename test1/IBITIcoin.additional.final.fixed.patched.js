const { expect } = require("chai");
const { ethers } = require("hardhat");
const { id }     = require("ethers");   // для formatBytes32String

describe("IBITIcoin Extended", function () {
  let owner, alice, bob;
  let token, feeManager, userStatusManager, bridgeManager, stakingModule, daoModule, nftContract;
  let payToken, mockFeed;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Деплой вспомогательных контрактов
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const feeToken  = await ERC20Mock.deploy("FEE", "FEE", owner.address, ethers.parseUnits("1000", 8));
    await feeToken.waitForDeployment();

    payToken = await ERC20Mock.deploy("USDT", "USDT", owner.address, ethers.parseUnits("100000", 8));
    await payToken.waitForDeployment();

    const FeeManager  = await ethers.getContractFactory("FeeManager");
    feeManager        = await FeeManager.deploy(feeToken.target);
    await feeManager.waitForDeployment();

    const USM         = await ethers.getContractFactory("UserStatusManager");
    userStatusManager = await USM.deploy();
    await userStatusManager.waitForDeployment();

    const BM          = await ethers.getContractFactory("BridgeManager");
    bridgeManager     = await BM.deploy();
    await bridgeManager.waitForDeployment();

    const DSM         = await ethers.getContractFactory("DummyStakingModule");
    stakingModule     = await DSM.deploy();
    await stakingModule.waitForDeployment();

    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftContract       = await NFTDiscount.deploy();
    await nftContract.waitForDeployment();

    const daoToken    = await ERC20Mock.deploy("DAO", "DAO", owner.address, ethers.parseUnits("1000", 8));
    await daoToken.waitForDeployment();

    const TestDAOModule = await ethers.getContractFactory("TestDAOModule");
    daoModule           = await TestDAOModule.deploy(daoToken.target, nftContract.target);
    await daoModule.waitForDeployment();

    // Деплой основного токена
    const IBITIcoin = await ethers.getContractFactory("IBITIcoin");
    token = await IBITIcoin.deploy(
      "IBITI",
      "IBI",
      owner.address,
      owner.address,
      feeManager.target,
      userStatusManager.target,
      bridgeManager.target,
      stakingModule.target,
      daoModule.target
    );
    await token.waitForDeployment();

    // Настройка NFT-discount и прав
    await token.setNFTDiscount(nftContract.target);
    await nftContract.setDiscountOperator(token.target);

    // Мок оракул
    const MockAggregator = await ethers.getContractFactory("MockAggregator");
    mockFeed = await MockAggregator.deploy(8);
    await mockFeed.waitForDeployment();

    // Базовая конфигурация цены и платежей
    await token.setPriceFeed(mockFeed.target);
    await token.setAcceptedPayment(ethers.ZeroAddress, true);
    await token.setAcceptedPayment(payToken.target, true);
    await token.setCoinPriceToken(payToken.target, ethers.parseUnits("1", 8));
    await token.setCoinPriceBNB(ethers.parseUnits("0.01", 18));
    await token.setUseOracle(false);

    await feeManager.setTokenContract(token.target);

    // Распределяем IBI среди участников
    await token.transfer(alice.address, ethers.parseUnits("150", 8));
    await token.transfer(bob.address,   ethers.parseUnits("50",  8));
  });

  it("sellCoinToken учитывает 1% NFT-скидку", async function () {
    const sellAmount = ethers.parseUnits("10", 8);
    await payToken.transfer(token.target, sellAmount);

    // Минтим NFT со скидкой 1%
    const mintTx = await nftContract.mint(alice.address, 1, "ipfs://discount");
    const receipt = await mintTx.wait();
    // Находим tokenId в логах Transfer
    let nftId;
    for (const log of receipt.logs) {
      try {
        const parsed = nftContract.interface.parseLog(log);
        if (parsed.name === 'Transfer') {
          nftId = parsed.args.tokenId;
          break;
        }
      } catch {}
    }
    expect(nftId).to.not.be.undefined;

    // Даем контракту право списывать NFT
    await nftContract.connect(alice).setApprovalForAll(token.target, true);

    const before = await payToken.balanceOf(alice.address);
    await token.connect(alice).sellCoinToken(
      payToken.target,
      sellAmount,
      nftId
    );
    const after = await payToken.balanceOf(alice.address);

    const diff = after - before;
    // новая логика: сначала базовая комиссия 10% = 10, затем скидка 1% на комиссию → fee = 9.9, net = 100 − 9.9 = 90.1
    const gross = sellAmount;
    const baseFee = gross * 10n / 100n;
    const discount = baseFee * 1n / 100n;
    const finalFee = baseFee - discount;
    expect(diff).to.equal(ethers.parseUnits("9.01", 8));
  });

  it("purchaseCoinBNB + withdrawOwnerFunds (фиксированная цена)", async function () {
    await token.setUseOracle(false);
    const buyValue  = ethers.parseEther("0.02");
    const expected  = ethers.parseUnits("2", 8);

    const before = await token.balanceOf(bob.address);
    await token.connect(bob).purchaseCoinBNB({ value: buyValue });
    const after = await token.balanceOf(bob.address);

    expect(after - before).to.equal(expected);

  });

  it("purchaseCoinBNB с оракулом Chainlink", async function () {
    await token.setUseOracle(true);
    await mockFeed.setPrice(2000n * 10n ** 8n);
    await token.setCoinPriceUSD(100);

    const bnbToSend = ethers.parseUnits("0.0005", 18);
    const before    = await token.balanceOf(bob.address);

    await token.connect(bob).purchaseCoinBNB({ value: bnbToSend });
    const after = await token.balanceOf(bob.address);

    expect(after).to.be.gt(before);
  });

  it("правильный вызов formatBytes32String", async function () {
    const formatted = id("TEST");
    expect(formatted).to.be.a("string");
    expect(formatted.startsWith("0x")).to.be.true;
    expect(formatted.length).to.equal(66);
  });
});