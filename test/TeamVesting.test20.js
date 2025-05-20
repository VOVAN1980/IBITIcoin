const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TeamVesting – vesting schedule and release", function () {
  let owner, beneficiary, other;
  let token, vesting;
  const TOTAL_ALLOC = ethers.parseUnits("1000", 18);
  let start;

  beforeEach(async function () {
    [owner, beneficiary, other] = await ethers.getSigners();
    // Set vesting start 100 seconds ahead
    const block = await ethers.provider.getBlock("latest");
    start = block.timestamp + 100;

    // Deploy vesting contract
    const Vest = await ethers.getContractFactory("TeamVesting");
    vesting = await Vest.deploy(TOTAL_ALLOC, start, beneficiary.address);
    await vesting.waitForDeployment();

    // Deploy token and fund vesting
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("MockToken", "MTK", owner.address, TOTAL_ALLOC);
    await token.waitForDeployment();
    await vesting.setTokenAddress(token.target);
    await token.approve(vesting.target, TOTAL_ALLOC);
    await vesting.depositTokens(TOTAL_ALLOC);
  });

  it("constructor reverts on invalid parameters", async function () {
    const Vest = await ethers.getContractFactory("TeamVesting");
    await expect(Vest.deploy(0n, start, beneficiary.address))
      .to.be.revertedWith("Allocation zero");
    await expect(Vest.deploy(TOTAL_ALLOC, start, ethers.ZeroAddress))
      .to.be.revertedWith("Beneficiary zero");
  });

  it("setTokenAddress and setBeneficiary validate and emit events", async function () {
    await expect(vesting.setTokenAddress(ethers.ZeroAddress))
      .to.be.revertedWith("Token zero");
    await expect(vesting.setTokenAddress(owner.address))
      .to.emit(vesting, "TokenAddressSet").withArgs(owner.address);

    await expect(vesting.setBeneficiary(ethers.ZeroAddress))
      .to.be.revertedWith("Beneficiary zero");
    await expect(vesting.setBeneficiary(other.address))
      .to.emit(vesting, "BeneficiaryUpdated").withArgs(other.address);
  });

  it("releasableAmount yields 0 before start, 20% at start", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [start - 10]);
    await ethers.provider.send("evm_mine", []);
    expect(await vesting.releasableAmount()).to.equal(0n);

    await ethers.provider.send("evm_setNextBlockTimestamp", [start]);
    await ethers.provider.send("evm_mine", []);
    const twenty = TOTAL_ALLOC * 20n / 100n;
    expect(await vesting.releasableAmount()).to.equal(twenty);
  });

  it("vested grows to 50% after 6 months and to 100% after full schedule", async function () {
    const sixMonth = start + 180 * 24 * 3600;
    await ethers.provider.send("evm_setNextBlockTimestamp", [sixMonth]);
    await ethers.provider.send("evm_mine", []);
    const fifty = TOTAL_ALLOC * 50n / 100n;
    expect(await vesting.releasableAmount()).to.equal(fifty);

    const fullTime = start + (3 * 365 + 180) * 24 * 3600;
    await ethers.provider.send("evm_setNextBlockTimestamp", [fullTime]);
    await ethers.provider.send("evm_mine", []);
    expect(await vesting.releasableAmount()).to.equal(TOTAL_ALLOC);
  });

  it("release and releaseTo correctly transfer tokens and emit events", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [start]);
    await ethers.provider.send("evm_mine", []);
    const amount20 = TOTAL_ALLOC * 20n / 100n;
    const bal0 = await token.balanceOf(beneficiary.address);
    await expect(vesting.release())
      .to.emit(vesting, "Released").withArgs(amount20);
    expect(await token.balanceOf(beneficiary.address)).to.equal(bal0 + amount20);

    const sixMonth = start + 180 * 24 * 3600;
    await ethers.provider.send("evm_setNextBlockTimestamp", [sixMonth]);
    await ethers.provider.send("evm_mine", []);
    const amount30 = TOTAL_ALLOC * 30n / 100n;
    const balOther = await token.balanceOf(other.address);
    await expect(vesting.releaseTo(other.address))
      .to.emit(vesting, "Released").withArgs(amount30);
    expect(await token.balanceOf(other.address)).to.equal(balOther + amount30);
  });

  it("getVestingInfo returns values at 6 months within tolerance", async function () {
    const sixMonth = start + 180 * 24 * 3600;
    await ethers.provider.send("evm_setNextBlockTimestamp", [sixMonth]);
    await ethers.provider.send("evm_mine", []);
    const info = await vesting.getVestingInfo();
    const expected = TOTAL_ALLOC * 50n / 100n;
    // Allow small timestamp drift
    expect(info.totalVested).to.be.closeTo(expected, ethers.parseUnits("1", 0));
    expect(info.locked).to.be.closeTo(TOTAL_ALLOC - expected, ethers.parseUnits("1", 0));
    expect(info.pending).to.be.closeTo(expected, ethers.parseUnits("1", 0));
  });

  it("release reverts when no tokens due or token not set", async function () {
    const Vest = await ethers.getContractFactory("TeamVesting");
    const fresh = await Vest.deploy(TOTAL_ALLOC, start, beneficiary.address);
    await fresh.waitForDeployment();
    // No token address configured
    await expect(fresh.release()).to.be.revertedWith("Token not set");

    // Configure token but no deposit
    await fresh.setTokenAddress(token.target);
    await expect(fresh.release()).to.be.revertedWith("No tokens due");
  });
});