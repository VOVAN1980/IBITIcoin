const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAOModule uncovered branch [line 224]", function () {
  let dao, nft, token, owner, user;

  beforeEach(async () => {
  [owner, user] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("ERC20MintableMock");
  token = await Token.deploy("IBITI", "IBITI");
  await token.mint(user.address, ethers.parseUnits("1000", 18));

  const NFT = await ethers.getContractFactory("NFTDiscount");
  nft = await NFT.deploy();

  const DAO = await ethers.getContractFactory("TestDAOModule");
  dao = await DAO.deploy(token.target, nft.target);

  await nft.connect(owner).setDAOModule(dao.target); // ✅ корректная авторизация

  await token.connect(user).transfer(dao.target, ethers.parseUnits("200", 18));
  await dao.connect(user).registerVoter();
  await dao.connect(user).createProposalSimple("Proposal #1");
});

  it("should revert if rewards already issued [line 224]", async () => {
    // Первый вызов — успешно
    await dao.connect(owner).awardNFTReward(
      0,
      user.address,
      10,
      "ipfs://reward1"
    );

    // Повторный вызов — должен упасть по строке 224
    await expect(
      dao.connect(owner).awardNFTReward(
        0,
        user.address,
        10,
        "ipfs://reward2"
      )
    ).to.be.revertedWith("Rewards already issued for this proposal");
  });
});
