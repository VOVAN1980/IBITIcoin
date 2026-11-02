// Токен и вестинг: снять чужие токены, сжечь чужие, взять долю команды раньше графика.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, I, DAY, nextTxAt } = require("./fixture");

describe("Атаки: токен", function () {
  let c;
  beforeEach(async () => {
    c = await deployAll();
  });

  it("чужие токены не снять и не сжечь без разрешения", async () => {
    const victim = c.owner.address;
    const before = await c.token.balanceOf(victim);
    await expect(c.token.connect(c.mallory).transferFrom(victim, c.mallory.address, 1n)).to.be.revertedWith("ERC20: insufficient allowance");
    await expect(c.token.connect(c.mallory).burnFrom(victim, 1n)).to.be.revertedWith("ERC20: insufficient allowance");
    expect(await c.token.balanceOf(victim)).to.equal(before);
  });

  it("контракты проекта не снимают токены с кошелька, который дал разрешение другому", async () => {
    await c.token.connect(c.alice).approve(c.mallory.address, I(5));
    const data = c.token.interface.encodeFunctionData("transferFrom", [c.alice.address, c.mallory.address, I(6)]);
    await expect(c.mallory.sendTransaction({ to: c.token.target, data })).to.be.reverted;
    await c.token.connect(c.mallory).transferFrom(c.alice.address, c.mallory.address, I(5));
    expect(await c.token.allowance(c.alice.address, c.mallory.address)).to.equal(0n);
    await expect(c.token.connect(c.mallory).transferFrom(c.alice.address, c.mallory.address, 1n)).to.be.reverted;
  });

  it("больше баланса не передать, в ноль не передать, выпуск только падает от сжигания", async () => {
    const supply = await c.token.totalSupply();
    const all = await c.token.balanceOf(c.mallory.address);
    await expect(c.token.connect(c.mallory).transfer(c.alice.address, all + 1n)).to.be.reverted;
    await expect(c.token.connect(c.mallory).transfer(ethers.ZeroAddress, 1n)).to.be.reverted;
    await expect(c.token.connect(c.mallory).burn(all + 1n)).to.be.reverted;
    await c.token.connect(c.mallory).burn(I(1));
    expect(await c.token.totalSupply()).to.equal(supply - I(1));
  });

  it("в токене только стандарт ERC-20 и сжигание: ни выпуска, ни паузы, ни владельца", async () => {
    const names = [];
    c.token.interface.forEachFunction((f) => names.push(f.name));
    expect(names.sort()).to.deep.equal(["TOTAL_SUPPLY", "allowance", "approve", "balanceOf", "burn", "burnFrom", "decimals", "decreaseAllowance", "increaseAllowance", "name", "symbol", "totalSupply", "transfer", "transferFrom"].sort());
  });
});

describe("Атаки: вестинг", function () {
  let c, start;
  const open = async () => c.vesting.available();

  beforeEach(async () => {
    c = await deployAll();
    start = await c.vesting.start();
    await c.vesting.connect(c.vestOwner).addMember(c.member.address);
  });

  it("член команды не снимает сам, посторонний не добавляет себя", async () => {
    await expect(c.vesting.connect(c.member).release(c.member.address, 1n)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(c.vesting.connect(c.mallory).addMember(c.mallory.address)).to.be.revertedWith("Ownable: caller is not the owner");
    expect(await c.vesting.isMember(c.mallory.address)).to.equal(false);
  });

  it("владелец не выдаёт сверх графика ни на одной границе", async () => {
    const owner = c.vesting.connect(c.vestOwner);
    const points = [[179, "2000000"], [180, "5000000"], [1094, "5000000"]];
    for (const [days, unlocked] of points) {
      await nextTxAt(start + BigInt(days * DAY));
      const can = I(unlocked) - (await c.vesting.released());
      if (can > 0n) await owner.release(c.member.address, can);
      else await ethers.provider.send("evm_mine", []);
      await expect(owner.release(c.member.address, 1n), `${days} дней`).to.be.revertedWithCustomError(c.vesting, "ExceedsAvailable");
    }
    expect(await c.token.balanceOf(c.member.address)).to.equal(I(5_000_000));
    // Точные границы: ровно на 1095 днях новой части ещё нет, дальше она идёт равномерно
    expect(await c.vesting.unlockedAt(start + BigInt(1095 * DAY))).to.equal(I(5_000_000));
    expect(await c.vesting.unlockedAt(start + BigInt((1095 + 90) * DAY))).to.equal(I(7_500_000));
    expect(await c.vesting.unlockedAt(start + BigInt((1095 + 180) * DAY))).to.equal(I(10_000_000));
  });

  it("за 1000 лет не выдать больше 10 млн, чужие токены на контракте доступ не расширяют", async () => {
    await c.token.transfer(c.vesting.target, I(1_000));
    await nextTxAt(start + BigInt(1000 * 365 * DAY));
    await ethers.provider.send("evm_mine", []);
    expect(await open()).to.equal(I(10_000_000));
    const owner = c.vesting.connect(c.vestOwner);
    await expect(owner.release(c.member.address, I(10_000_000) + 1n)).to.be.revertedWithCustomError(c.vesting, "ExceedsAvailable");
    await owner.release(c.member.address, I(10_000_000));
    expect(await open()).to.equal(0n);
    await expect(owner.release(c.member.address, 1n)).to.be.revertedWithCustomError(c.vesting, "ExceedsAvailable");
    expect(await c.token.balanceOf(c.vesting.target)).to.equal(I(1_000));
  });

  it("много мелких выдач не обходят график, адрес не из команды не получает", async () => {
    const owner = c.vesting.connect(c.vestOwner);
    await expect(owner.release(c.mallory.address, 1n)).to.be.revertedWithCustomError(c.vesting, "NotMember");
    await owner.release(c.member.address, I(1_000_000));
    await owner.release(c.member.address, I(1_000_000));
    await expect(owner.release(c.member.address, 1n)).to.be.revertedWithCustomError(c.vesting, "ExceedsAvailable");
    await owner.removeMember(c.member.address);
    await expect(owner.release(c.member.address, 1n)).to.be.revertedWithCustomError(c.vesting, "NotMember");
  });

  it("враждебный токен не может вернуться в выдачу: права проверяются у вызывающего", async () => {
    const [, , vestOwner, , , , , member] = await ethers.getSigners();
    const bad = await ethers.deployContract("HostileToken", [8]);
    const v = await ethers.deployContract("IBITIVesting", [bad.target, vestOwner.address, I(1_000), start]);
    await bad.transfer(v.target, I(1_000));
    await v.connect(vestOwner).addMember(member.address);
    await bad.arm(v.target, v.interface.encodeFunctionData("release", [member.address, I(100)]));
    await v.connect(vestOwner).release(member.address, I(100));
    expect(await bad.attempts()).to.be.greaterThan(0n);
    expect(await bad.successes()).to.equal(0n);
    expect(await v.released()).to.equal(I(100));
  });
});
