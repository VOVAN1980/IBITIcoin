const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const E = (n) => ethers.parseUnits(String(n), 8);
const DAY = 86400;
const ALLOCATION = E(10_000_000);

async function setTime(ts) {
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine");
}

describe("IBITIVesting — доля команды 10 млн", function () {
  let token, vesting, deployer, owner, alice, bob, stranger, start;

  beforeEach(async () => {
    [deployer, owner, alice, bob, stranger] = await ethers.getSigners();
    start = (await ethers.provider.getBlock("latest")).timestamp + 100;

    // Как в настоящем деплое: адрес токена известен заранее, токен сразу кладёт 10 млн на вестинг.
    const nonce = await deployer.getNonce();
    const tokenAddress = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });
    vesting = await ethers.deployContract("IBITIVesting", [tokenAddress, owner.address, ALLOCATION, start]);
    token = await ethers.deployContract("IBITI", [[vesting.target, deployer.address], [ALLOCATION, E(90_000_000)]]);
    expect(token.target).to.equal(tokenAddress);
  });

  it("график как в whitepaper: 20% сразу, 30% через 180 дней, 50% равномерно за 180 дней после 3 лет", async () => {
    const points = [
      ["за секунду до старта", start - 1, 0],
      ["старт", start, 2_000_000],
      ["179 дней", start + 179 * DAY, 2_000_000],
      ["180 дней", start + 180 * DAY, 5_000_000],
      ["1094 дня", start + 1094 * DAY, 5_000_000],
      ["1095 дней (3 года)", start + 1095 * DAY, 5_000_000],
      ["1140 дней", start + 1140 * DAY, 6_250_000],
      ["1185 дней", start + 1185 * DAY, 7_500_000],
      ["1275 дней", start + 1275 * DAY, 10_000_000],
      ["5000 дней", start + 5000 * DAY, 10_000_000],
    ];
    const rows = [];
    for (const [when, ts, expected] of points) {
      const open = await vesting.unlockedAt(ts);
      expect(open).to.equal(E(expected));
      rows.push({ когда: when, "открыто всего": ethers.formatUnits(open, 8) });
    }
    console.table(rows);
  });

  it("параметры заданы при создании, токены лежат на вестинге", async () => {
    expect(await vesting.token()).to.equal(token.target);
    expect(await vesting.owner()).to.equal(owner.address);
    expect(await vesting.totalAllocation()).to.equal(ALLOCATION);
    expect(await vesting.start()).to.equal(BigInt(start));
    expect(await token.balanceOf(vesting.target)).to.equal(ALLOCATION);
  });

  it("выдавать может только владелец и только адресам из списка", async () => {
    await setTime(start);
    await expect(vesting.connect(stranger).release(stranger.address, 1n)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(vesting.connect(stranger).addMember(stranger.address)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(vesting.connect(deployer).release(alice.address, 1n)).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(vesting.connect(owner).release(alice.address, 1n))
      .to.be.revertedWithCustomError(vesting, "NotMember").withArgs(alice.address);

    await vesting.connect(owner).addMember(alice.address);
    await vesting.connect(owner).release(alice.address, 1n);
    expect(await token.balanceOf(alice.address)).to.equal(1n);

    await vesting.connect(owner).removeMember(alice.address);
    await expect(vesting.connect(owner).release(alice.address, 1n)).to.be.revertedWithCustomError(vesting, "NotMember");
  });

  it("до старта выдать нельзя ничего", async () => {
    await vesting.connect(owner).addMember(alice.address);
    await expect(vesting.connect(owner).release(alice.address, 1n)).to.be.revertedWithCustomError(vesting, "ExceedsAvailable");
  });

  it("не больше графика: ни на одну минимальную единицу, на всех этапах; разным адресам в сумме", async () => {
    await vesting.connect(owner).addMember(alice.address);
    await vesting.connect(owner).addMember(bob.address);

    await setTime(start);
    await vesting.connect(owner).release(alice.address, E(1_500_000));
    await expect(vesting.connect(owner).release(bob.address, E(500_000) + 1n)).to.be.revertedWithCustomError(vesting, "ExceedsAvailable");
    await vesting.connect(owner).release(bob.address, E(500_000));
    expect(await vesting.released()).to.equal(E(2_000_000));
    expect(await vesting.available()).to.equal(0n);
    await expect(vesting.connect(owner).release(alice.address, 1n)).to.be.revertedWithCustomError(vesting, "ExceedsAvailable");

    await setTime(start + 180 * DAY);
    await vesting.connect(owner).release(alice.address, E(3_000_000));
    await expect(vesting.connect(owner).release(alice.address, 1n)).to.be.revertedWithCustomError(vesting, "ExceedsAvailable");

    await setTime(start + 1275 * DAY);
    await vesting.connect(owner).release(bob.address, E(5_000_000));
    expect(await token.balanceOf(alice.address)).to.equal(E(4_500_000));
    expect(await token.balanceOf(bob.address)).to.equal(E(5_500_000));
    expect(await token.balanceOf(vesting.target)).to.equal(0n);
    await expect(vesting.connect(owner).release(bob.address, 1n)).to.be.revertedWithCustomError(vesting, "ExceedsAvailable");
  });

  it("невыданное ждёт на контракте и не пропадает: можно выдать позже разом", async () => {
    await vesting.connect(owner).addMember(alice.address);
    await setTime(start + 180 * DAY);
    expect(await vesting.available()).to.equal(E(5_000_000));
    await vesting.connect(owner).release(alice.address, E(5_000_000));
    expect(await token.balanceOf(alice.address)).to.equal(E(5_000_000));
  });

  it("отказаться от владения нельзя; передача в два шага, старый владелец теряет права", async () => {
    await expect(vesting.connect(owner).renounceOwnership()).to.be.revertedWithCustomError(vesting, "RenounceDisabled");
    await expect(vesting.connect(stranger).renounceOwnership()).to.be.revertedWith("Ownable: caller is not the owner");

    await vesting.connect(owner).transferOwnership(bob.address);
    expect(await vesting.owner()).to.equal(owner.address); // пока новый не подтвердил
    await expect(vesting.connect(stranger).acceptOwnership()).to.be.reverted;

    await vesting.connect(bob).acceptOwnership();
    expect(await vesting.owner()).to.equal(bob.address);
    await expect(vesting.connect(owner).addMember(owner.address)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("отклоняет неверные параметры", async () => {
    const F = await ethers.getContractFactory("IBITIVesting");
    await expect(F.deploy(ethers.ZeroAddress, owner.address, ALLOCATION, start)).to.be.revertedWithCustomError(F, "ZeroAddress");
    await expect(F.deploy(token.target, ethers.ZeroAddress, ALLOCATION, start)).to.be.revertedWithCustomError(F, "ZeroAddress");
    await expect(F.deploy(token.target, owner.address, 0, start)).to.be.revertedWithCustomError(F, "ZeroAmount");
    await vesting.connect(owner).addMember(alice.address);
    await setTime(start);
    await expect(vesting.connect(owner).release(alice.address, 0)).to.be.revertedWithCustomError(F, "ZeroAmount");
    await expect(vesting.connect(owner).addMember(ethers.ZeroAddress)).to.be.revertedWithCustomError(F, "ZeroAddress");
  });
});
