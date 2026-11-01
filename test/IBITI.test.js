const { expect } = require("chai");
const { ethers } = require("hardhat");

const E = (n) => ethers.parseUnits(String(n), 8);
const TOTAL = E(100_000_000);

describe("IBITI V2 — токен", function () {
  let F, a, b, c;

  beforeEach(async () => {
    [a, b, c] = await ethers.getSigners();
    F = await ethers.getContractFactory("IBITI");
  });

  it("выпускает ровно 100 000 000 IBITI и раздаёт по списку", async () => {
    const t = await F.deploy([a.address, b.address], [E(99_000_000), E(1_000_000)]);
    expect(await t.name()).to.equal("IBITIcoin");
    expect(await t.symbol()).to.equal("IBITI");
    expect(await t.decimals()).to.equal(8n);
    expect(await t.totalSupply()).to.equal(TOTAL);
    expect(await t.TOTAL_SUPPLY()).to.equal(TOTAL);
    expect(await t.balanceOf(a.address)).to.equal(E(99_000_000));
    expect(await t.balanceOf(b.address)).to.equal(E(1_000_000));
  });

  it("отклоняет неверное распределение", async () => {
    await expect(F.deploy([], [])).to.be.revertedWithCustomError(F, "EmptyDistribution");
    await expect(F.deploy([a.address], [E(1), E(2)])).to.be.revertedWithCustomError(F, "LengthMismatch");
    await expect(F.deploy([ethers.ZeroAddress], [TOTAL]))
      .to.be.revertedWithCustomError(F, "ZeroRecipient").withArgs(0);
    await expect(F.deploy([a.address, b.address], [TOTAL, 0]))
      .to.be.revertedWithCustomError(F, "ZeroAmount").withArgs(1);
    await expect(F.deploy([a.address], [TOTAL - 1n]))
      .to.be.revertedWithCustomError(F, "SupplyMismatch").withArgs(TOTAL - 1n);
    await expect(F.deploy([a.address, b.address], [TOTAL, 1n]))
      .to.be.revertedWithCustomError(F, "SupplyMismatch").withArgs(TOTAL + 1n);
  });

  describe("переводы", function () {
    let t;
    beforeEach(async () => {
      t = await F.deploy([a.address], [TOTAL]);
    });

    it("получатель получает ровно отправленное — комиссий нет", async () => {
      for (const n of [1n, E(1), E(1_000), E(1_000_000)]) {
        const before = await t.balanceOf(b.address);
        await t.transfer(b.address, n);
        expect((await t.balanceOf(b.address)) - before).to.equal(n);
      }
      expect(await t.totalSupply()).to.equal(TOTAL);
    });

    it("transferFrom работает только в пределах approve", async () => {
      await expect(t.connect(c).transferFrom(a.address, c.address, 1n))
        .to.be.revertedWith("ERC20: insufficient allowance");
      await t.approve(c.address, E(10));
      await t.connect(c).transferFrom(a.address, c.address, E(10));
      expect(await t.balanceOf(c.address)).to.equal(E(10));
      await expect(t.connect(c).transferFrom(a.address, c.address, 1n))
        .to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("burn — только свои; burnFrom — только в пределах approve; supply уменьшается", async () => {
      await t.burn(E(5));
      expect(await t.totalSupply()).to.equal(TOTAL - E(5));
      await expect(t.connect(c).burnFrom(a.address, 1n)).to.be.revertedWith("ERC20: insufficient allowance");
      await t.approve(c.address, E(2));
      await t.connect(c).burnFrom(a.address, E(2));
      expect(await t.totalSupply()).to.equal(TOTAL - E(7));
      await expect(t.connect(b).burn(1n)).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
});
