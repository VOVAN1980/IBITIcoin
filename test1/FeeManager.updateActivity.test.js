const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeManager – updateActivity branches", function() {
  let owner, feeManager, erc20, caller;

  before(async () => {
    [owner] = await ethers.getSigners();

    // Deploy ERC20Mock to satisfy constructor
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    erc20 = await ERC20Mock.deploy(
      "Mock", "MCK",
      owner.address,
      ethers.parseUnits("1000", 8)
    );
    await erc20.waitForDeployment();

    // Deploy FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(erc20.target);
    await feeManager.waitForDeployment();
  });

  it("reverts when non-tokenContract calls updateActivity", async () => {
    await expect(
      feeManager.updateActivity(owner.address, 500, true)
    ).to.be.revertedWith("Only token contract");
  });

      it("succeeds when tokenContract calls updateActivity and emits event", async function() {
    const [owner] = await ethers.getSigners();
    // authorize owner as tokenContract
    await feeManager.connect(owner).setTokenContract(owner.address);

    // Call updateActivity and expect event
    await expect(
      feeManager.updateActivity(owner.address, 777, false)
    ).to.emit(feeManager, "ActivityUpdated");
  });
});
