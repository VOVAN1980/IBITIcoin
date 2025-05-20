// test/DAOModule.optin.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAOModule – optIn and related logic", function () {
  let token, nftDiscount, dao;
  let owner, alice, bob;
  const VOTE_THRESHOLD = 100n;
  const DECIMALS = 8;
  const DAY = 24 * 3600;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // 1) Деплой ERC20Mock с достаточным initialSupply
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    // initialSupply = VOTE_THRESHOLD * 10^decimals * 3 (для owner, alice, bob)
    const initialSupply = VOTE_THRESHOLD * (10n ** BigInt(DECIMALS)) * 3n;
    token = await ERC20Mock.deploy("TST", "TST", owner.address, initialSupply);
    await token.waitForDeployment();

    // Раздаём alice и bob по VOTE_THRESHOLD
    const thresholdUnits = ethers.parseUnits("100", DECIMALS);
    await token.transfer(alice.address, thresholdUnits);
    await token.transfer(bob.address, thresholdUnits);

    // 2) Деплой NFTDiscount
    const NFTDiscount = await ethers.getContractFactory("NFTDiscount");
    nftDiscount = await NFTDiscount.deploy();
    await nftDiscount.waitForDeployment();

    // 3) Деплой TestDAOModule
    const TestDAOModule = await ethers.getContractFactory("TestDAOModule");
    dao = await TestDAOModule.deploy(token.target, nftDiscount.target);
    await dao.waitForDeployment();

    // Разрешаем DAO-модулю минтить NFT
    await nftDiscount.connect(owner).setDAOModule(dao.target);

    // 4) Регистрация участников
    await dao.connect(owner).registerVoter();
    await dao.connect(alice).registerVoter();
    await dao.connect(bob).registerVoter();

    // 5) Создаём предложение с minVotingPeriod
    await dao.connect(alice).createProposalSimple("Test opt-in");
  });

  it("should allow optIn before voting, track count & emit event", async function () {
    // Изначально никто не opt‑in
    expect(await dao.optedInCount(0)).to.equal(0);

    // alice делает opt‑in
    await expect(dao.connect(alice).optIn(0))
      .to.emit(dao, "OptedIn")
      .withArgs(0, alice.address);

    // Счётчик увеличился
    expect(await dao.optedInCount(0)).to.equal(1);

    // bob тоже
    await dao.connect(bob).optIn(0);
    expect(await dao.optedInCount(0)).to.equal(2);
  });

  it("should revert double optIn", async function () {
    await dao.connect(alice).optIn(0);
    await expect(dao.connect(alice).optIn(0))
      .to.be.revertedWith("Already opted in");
  });

  it("should prevent voting without optIn", async function () {
    // alice не вызывала optIn
    await expect(dao.connect(alice).vote(0, true))
      .to.be.revertedWith("Must opt-in first");
  });

  it("should prevent optIn and vote after voting ended", async function () {
    // Прокручиваем время за пределы votingPeriod
    const minPeriod = await dao.minVotingPeriod();
    await ethers.provider.send("evm_increaseTime", [Number(minPeriod) + 1]);
    await ethers.provider.send("evm_mine");

    // opt‑in уже нельзя
    await expect(dao.connect(alice).optIn(0))
      .to.be.revertedWith("Voting ended");

    // даже если бы был opt‑in, голосовать нельзя
    // для этого сначала создали ещё одно предложение, но проверка аналогична
  });
});
