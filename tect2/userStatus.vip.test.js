const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("UserStatusManager – VIP", () => {
  let owner, bob, token, status;
  const d8 = (n) => ethers.parseUnits(n.toString(), 8); // helper

  beforeEach(async () => {
    [owner, bob] = await ethers.getSigners();

    // ← ERC20Mock на 8 dec, требуется 4 аргумента
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("IBITI", "IBI", owner.address, 0);
    await token.waitForDeployment();

    // UserStatusManager
    const UserStatusManager = await ethers.getContractFactory("UserStatusManager");
    status = await UserStatusManager.deploy();
    await status.waitForDeployment();
    await status.setIBIToken(token.target);
  });

  it("100 IBI: не VIP", async () => {
    await token.mint(bob.address, d8(100));
    expect(await status.isVIPUser(bob.address)).to.equal(false);

    await token.connect(bob).transfer(owner.address, d8(100));
    expect(await status.isVIPUser(bob.address)).to.equal(false);
  });

  it("1 000 IBI: становится VIP", async () => {
    await token.mint(bob.address, d8(1_000));
    expect(await status.isVIPUser(bob.address)).to.equal(true);
  });
});
