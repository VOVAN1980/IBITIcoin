const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTDiscount — withdrawPayments & usePandoraFor (branch coverage)", function () {
  let owner, user, recipient, discountOperator;
  let discount, payToken, ibitiToken;

  // Нулевой адрес и парсинг единиц через top-level API ethers v6
  const ZERO   = ethers.ZeroAddress;
  const AMOUNT = ethers.parseUnits("100", 18);

  beforeEach(async function () {
    [owner, user, recipient, discountOperator] = await ethers.getSigners();

    // 1) Деплой ERC20-моков
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    payToken = await ERC20Mock.deploy(
      "PayToken",
      "PAY",
      owner.address,
      AMOUNT * 2n
    );
    await payToken.waitForDeployment();

    ibitiToken = await ERC20Mock.deploy(
      "IbiToken",
      "IBI",
      owner.address,
      AMOUNT * 2n
    );
    await ibitiToken.waitForDeployment();

    // 2) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    discount = await NFTDiscount.deploy();
    await discount.waitForDeployment();

    // 3) Настройка: адреса и цена
    await discount.connect(owner).setPayToken(payToken.target);
    await discount.connect(owner).setIbitiToken(ibitiToken.target);
    await discount.connect(owner).setNftPrice(AMOUNT);

    // 4) Заливаем средства для withdrawPayments
    await payToken.connect(owner).transfer(discount.target, AMOUNT);
    await ibitiToken.connect(owner).transfer(discount.target, AMOUNT);

    // 5) Mint Pandora для usePandoraFor
    await discount.connect(owner).setDiscountOperator(discountOperator.address);
    await discount.connect(owner).mintPandora(user.address, "pandora://1");
  });

  describe("withdrawPayments", function () {
    it("transfers only payToken when ibitiToken == ZERO", async function () {
      // Новый экземпляр без ibitiToken
      const NFTD2 = await ethers.getContractFactory("NFTDiscount");
      const discount2 = await NFTD2.deploy();
      await discount2.waitForDeployment();

      await discount2.connect(owner).setPayToken(payToken.target);
      await payToken.connect(owner).transfer(discount2.target, AMOUNT);

      const beforePay = await payToken.balanceOf(recipient.address);
      await discount2.connect(owner).withdrawPayments(recipient.address, AMOUNT);
      const afterPay = await payToken.balanceOf(recipient.address);
      expect(afterPay - beforePay).to.equal(AMOUNT);

      // ibitiToken не ушёл
      expect(await ibitiToken.balanceOf(recipient.address)).to.equal(0n);
    });

    it("transfers both payToken and ibitiToken when both set", async function () {
      const beforePay = await payToken.balanceOf(recipient.address);
      const beforeIbi = await ibitiToken.balanceOf(recipient.address);

      await discount.connect(owner).withdrawPayments(recipient.address, AMOUNT);

      const afterPay = await payToken.balanceOf(recipient.address);
      const afterIbi = await ibitiToken.balanceOf(recipient.address);
      expect(afterPay - beforePay).to.equal(AMOUNT);
      expect(afterIbi - beforeIbi).to.equal(AMOUNT);
    });
  });

  describe("usePandoraFor", function () {
    let tokenId;
    beforeEach(async function () {
      // последний заминченный токен
      tokenId = (await discount.nextTokenId()) - 1n;
    });

    it("reverts when called by non-operator", async function () {
      await expect(
        discount.connect(user).usePandoraFor(user.address, tokenId)
      ).to.be.revertedWith("Not authorized");
    });

    it("reverts if user is not owner", async function () {
      await expect(
        discount.connect(discountOperator).usePandoraFor(recipient.address, tokenId)
      ).to.be.revertedWith("Not owner");
    });

    it("increments usageCount up to limit without reset", async function () {
      for (let i = 1n; i <= 3n; i++) {
        await expect(
          discount.connect(discountOperator).usePandoraFor(user.address, tokenId)
        ).to.emit(discount, "NFTUsed").withArgs(user.address, tokenId, 100);

        const d = await discount.discountData(tokenId);
        expect(d.usageCount).to.equal(i);
      }
    });

    it("resets usageCount after 360 days", async function () {
      // 5 использований
      for (let i = 0; i < 5; i++) {
        await discount.connect(discountOperator).usePandoraFor(user.address, tokenId);
      }
      // перескок >360 дней
      await ethers.provider.send("evm_increaseTime", [360 * 24 * 3600 + 1]);
      await ethers.provider.send("evm_mine");

      await discount.connect(discountOperator).usePandoraFor(user.address, tokenId);
      const d = await discount.discountData(tokenId);
      expect(d.usageCount).to.equal(1n);

      const block = await ethers.provider.getBlock();
      expect(d.lastUsageReset).to.be.gte(BigInt(block.timestamp) - 1n);
    });

    it("reverts when usageCount ≥ 10 within reset period", async function () {
      for (let i = 0; i < 10; i++) {
        await discount.connect(discountOperator).usePandoraFor(user.address, tokenId);
      }
      await expect(
        discount.connect(discountOperator).usePandoraFor(user.address, tokenId)
      ).to.be.revertedWith("Usage limit reached");
    });
  });
});
