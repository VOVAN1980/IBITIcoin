const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IBITIcoin – fallback proxy coverage (lines 358, 394, 395)", function () {
  let owner, token, nft, dao, ibi, proxy;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // 1) Минимальный ERC20 для IBITINFT и DAO
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy(
      "IBITIcoin", "IBI", owner.address, ethers.parseEther("100000000")
    );
    await token.waitForDeployment();

    // 2) Реальный IBITINFT с валидными параметрами
    const IBITINFT = await ethers.getContractFactory("IBITINFT");
    nft = await IBITINFT.deploy(
      "IBITI NFT",
      "IBI-NFT",
      100_000_000,      // nftPrice (IBITI)
      100_000_000,      // nftPriceUSDT
      100,              // priceGrowthRate (1%)
      10,               // salesThreshold
      token.target      // адрес ERC20Mock
    );
    await nft.waitForDeployment();

    // 3) Реальный TestDAOModule, который использует onlyEligibleVoter
    // контракт лежит в папке mocks
    const TestDAO = await ethers.getContractFactory(
      "contracts/mocks/TestDAOModule.sol:TestDAOModule"
    );
    dao = await TestDAO.deploy(token.target, nft.target);
    await dao.waitForDeployment();

    // 4) Деплой основного контракта IBITIcoin
    const IBITI = await ethers.getContractFactory("IBITIcoin");
    ibi = await IBITI.deploy(
      "IBITIcoin",
      "IBI",
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      dao.target
    );
    await ibi.waitForDeployment();

    // 5) Создаём proxy с нужными fallback-методами
    const extraAbi = [
      "function createProposalSimple(string)",
      "function voteProposal(uint256,bool)",
      "function executeProposalSimple(uint256)"
    ];
    proxy = new ethers.Contract(ibi.target, extraAbi, owner);
  });

  it("fallback on createProposalSimple → Need threshold tokens", async function () {
    await expect(proxy.createProposalSimple("Test proposal"))
      .to.be.revertedWith("Need threshold tokens");
  });

  it("fallback on voteProposal → Need threshold tokens", async function () {
    await expect(proxy.voteProposal(0, true))
      .to.be.revertedWith("Need threshold tokens");
  });

  it("fallback on executeProposalSimple → revert without reason", async function () {
    // TestDAOModule.executeProposalSimple reverts without reason first
    await expect(proxy.executeProposalSimple(0))
      .to.be.revertedWithoutReason();
  });
});
