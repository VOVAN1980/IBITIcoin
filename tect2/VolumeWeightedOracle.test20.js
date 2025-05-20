const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolumeWeightedOracle – pool management and consult", function () {
  let owner, alice, bob;
  let oracle;
  const TEST_AMOUNT = ethers.parseUnits("100", 18);

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("VolumeWeightedOracle");
    oracle = await Oracle.deploy(18);
    await oracle.waitForDeployment();
  });

  it("initial poolCount is zero and getPrice returns 0", async function () {
    expect(await oracle.poolCount()).to.equal(0);
    expect(await oracle.getPrice()).to.equal(0);
  });

  it("owner can add and remove pools, poolCount updates correctly", async function () {
    // use alice.address as dummy pool
    await oracle.addPool(alice.address);
    expect(await oracle.poolCount()).to.equal(1);
    // add second pool
    await oracle.addPool(bob.address);
    expect(await oracle.poolCount()).to.equal(2);

    // remove first pool
    await oracle.removePool(alice.address);
    expect(await oracle.poolCount()).to.equal(1);
    // remove second
    await oracle.removePool(bob.address);
    expect(await oracle.poolCount()).to.equal(0);
  });

  it("reverts when non-owner tries to add or remove pools", async function () {
    await expect(
      oracle.connect(alice).addPool(alice.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      oracle.connect(alice).removePool(alice.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("reverts on duplicate add or remove non-existent pool", async function () {
    await oracle.addPool(alice.address);
    // duplicate add
    await expect(
      oracle.addPool(alice.address)
    ).to.be.revertedWith("Pool exists");
    // remove non-existent
    await expect(
      oracle.removePool(bob.address)
    ).to.be.revertedWith("Pool not found");
  });

  it("paused state blocks add and remove", async function () {
    await oracle.pause();
    await expect(
      oracle.addPool(alice.address)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      oracle.removePool(alice.address)
    ).to.be.revertedWith("Pausable: paused");
  });
});
