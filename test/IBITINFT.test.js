const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITINFT", function () {
  let ibitiToken, usdtToken, nft;
  let owner, buyer;
  const INITIAL_IBITI_BALANCE = ethers.parseUnits("1000", 8); // 1000 IBITI (8 decimals)
  const INITIAL_USDT_BALANCE = ethers.parseUnits("1000", 6);  // 1000 USDT (6 decimals)
  const NFT_PRICE = ethers.parseUnits("100", 8);              // Цена NFT в IBITI
  const USDT_PRICE = ethers.parseUnits("50", 6);              // Цена NFT в USDT
  const GROWTH_RATE = 500;                                    // 5% (500 basis points)
  const SALES_THRESHOLD = 2;

  beforeEach(async function () {
    [owner, buyer] = await ethers.getSigners();

    // Развертываем mock-токен для IBITI (8 decimals)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    ibitiToken = await ERC20Mock.deploy("IBITI", "IBI", owner.address, INITIAL_IBITI_BALANCE);
    await ibitiToken.waitForDeployment();

    // Развертываем mock-токен для USDT (6 decimals)
    usdtToken = await ERC20Mock.deploy("USDT", "USDT", buyer.address, INITIAL_USDT_BALANCE);
    await usdtToken.waitForDeployment();

    // Развертываем контракт IBITINFT
    const IBITINFT = await ethers.getContractFactory("IBITINFT");
    nft = await IBITINFT.deploy(
      "TestNFT",
      "TNFT",
      NFT_PRICE,
      USDT_PRICE,
      GROWTH_RATE,
      SALES_THRESHOLD,
      ibitiToken.target
    );
    await nft.waitForDeployment();
  });

  it("should mint NFT for IBITIcoin and convert IPFS to HTTPS URI", async function () {
    // Передаём покупателю IBITI-токены и разрешаем их расходование
    await ibitiToken.transfer(buyer.address, NFT_PRICE);
    await ibitiToken.connect(buyer).approve(nft.target, NFT_PRICE);

    const tx = await nft.connect(buyer).purchaseNFT("ipfs://QmTest");
    await expect(tx)
      .to.emit(nft, "NFTPurchased")
      .withArgs(buyer.address, 0, NFT_PRICE, ibitiToken.target);

    const tokenURI = await nft.tokenURI(0);
    expect(tokenURI).to.equal("https://dweb.link/ipfs/QmTest");
  });

  it("should revert on empty URI or duplicate URI for IBITI purchase", async function () {
    // Передаём покупателю IBITI-токены: используем BigInt-операцию умножения
    await ibitiToken.transfer(buyer.address, NFT_PRICE * 2n);
    await ibitiToken.connect(buyer).approve(nft.target, NFT_PRICE * 2n);

    // Пустой URI должен привести к revert
    await expect(nft.connect(buyer).purchaseNFT("")).to.be.revertedWith("Empty tokenURI");

    // Первая покупка с валидным URI
    await nft.connect(buyer).purchaseNFT("ipfs://QmDup");
    // Повторное использование того же URI должно привести к revert
    await expect(nft.connect(buyer).purchaseNFT("ipfs://QmDup")).to.be.revertedWith("URI already used");
  });

  it("should mint NFT for USDT payment after setting USDT parameters", async function () {
    // Устанавливаем параметры USDT
    await nft.connect(owner).setUSDTParameters(usdtToken.target, USDT_PRICE);

    // Покупатель уже имеет достаточный баланс USDT, поэтому достаточно только одобрения расхода
    await usdtToken.connect(buyer).approve(nft.target, USDT_PRICE);

    const tx = await nft.connect(buyer).purchaseNFTWithUSDT("ipfs://QmUSDT");
    await expect(tx)
      .to.emit(nft, "NFTPurchased")
      .withArgs(buyer.address, 0, USDT_PRICE, usdtToken.target);

    const tokenURI = await nft.tokenURI(0);
    expect(tokenURI).to.equal("https://dweb.link/ipfs/QmUSDT");
  });

  it("should update NFT price monthly if sales threshold reached", async function () {
    // Передаём покупателю IBITI-токены и устанавливаем разрешение: используем BigInt-операцию умножения
    await ibitiToken.transfer(buyer.address, NFT_PRICE * BigInt(SALES_THRESHOLD));
    await ibitiToken.connect(buyer).approve(nft.target, NFT_PRICE * BigInt(SALES_THRESHOLD));

    // Совершаем покупки, равные SALES_THRESHOLD
    for (let i = 0; i < SALES_THRESHOLD; i++) {
      await nft.connect(buyer).purchaseNFT(`ipfs://Sale${i}`);
    }

    // Увеличиваем время на 31 день (больше, чем интервал обновления цены)
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine");

    // Рассчитываем ожидаемую новую цену:
    // newPrice = (NFT_PRICE * (10000 + GROWTH_RATE)) / 10000
    const newPrice = (NFT_PRICE * (10000n + BigInt(GROWTH_RATE))) / 10000n;

    const tx = await nft.connect(owner).updateNFTPriceMonthly();
    const block = await ethers.provider.getBlock(tx.blockNumber);
    await expect(tx)
      .to.emit(nft, "PriceParametersUpdated")
      .withArgs(newPrice, block.timestamp);

    const currentPrice = await nft.nftPrice();
    expect(currentPrice).to.equal(newPrice);
  });

  it("should burn old token and mint new token with updated URI via updateNFT", async function () {
    // Передаём покупателю IBITI-токены и разрешаем их расходование
    await ibitiToken.transfer(buyer.address, NFT_PRICE);
    await ibitiToken.connect(buyer).approve(nft.target, NFT_PRICE);
    await nft.connect(buyer).purchaseNFT("ipfs://OldURI");

    const tx = await nft.connect(owner).updateNFT(0, "ipfs://NewURI");
    await expect(tx)
      .to.emit(nft, "NFTUpdated")
      .withArgs(0, 1, "https://dweb.link/ipfs/NewURI");

    // Проверяем, что старый токен с ID 0 сожжён
    await expect(nft.ownerOf(0)).to.be.reverted;
    // Проверяем, что новый токен с ID 1 имеет обновлённый URI
    const newTokenURI = await nft.tokenURI(1);
    expect(newTokenURI).to.equal("https://dweb.link/ipfs/NewURI");
  });
});
