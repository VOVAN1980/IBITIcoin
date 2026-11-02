// Все контракты проекта с настоящими параметрами основной сети, в чистой локальной сети.
const { ethers, network } = require("hardhat");
const { cards } = require("../../scripts/lib/nft-cards");

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);
const DAY = 86400;
const MONTH = 30 * DAY;

const nextTxAt = (ts) => network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
const travel = async (seconds) => {
  await network.provider.send("evm_increaseTime", [Number(seconds)]);
  await network.provider.send("evm_mine");
};
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;

async function deployAll() {
  const [owner, reserve, vestOwner, alice, bob, carol, mallory, member] = await ethers.getSigners();
  const usdt = await ethers.deployContract("TestUSDT");
  const token = await ethers.deployContract("IBITI", [[owner.address], [I(100_000_000)]]);

  const vesting = await ethers.deployContract("IBITIVesting", [token.target, vestOwner.address, I(10_000_000), await now()]);
  await token.transfer(vesting.target, I(10_000_000));

  const promo = await ethers.deployContract("IBITIPromoSale", [usdt.target, token.target, owner.address, reserve.address, U("0.11"), 1000, I(1), U(10), U(100)]);
  await token.transfer(promo.target, I(1_000_000));
  await promo.unpause();

  const staking = await ethers.deployContract("IBITIStaking", [token.target, owner.address, I(100)]);
  await token.transfer(staking.target, I(1_000_000));
  await staking.unpause();

  const nft = await ethers.deployContract("IBITICollection", [owner.address, reserve.address]);
  const nftSale = await ethers.deployContract("IBITINFTSale", [usdt.target, nft.target, owner.address, reserve.address]);
  await nft.addCards(cards.map((c) => c.uri), cards.map((c) => c.maxSupply));
  await nft.setSeller(nftSale.target);
  await nftSale.setPrices(cards.map((c) => c.id), cards.map((c) => U(c.price)));
  await nftSale.unpause();

  for (const u of [alice, bob, carol, mallory]) {
    await usdt.transfer(u.address, U(100_000));
    await token.transfer(u.address, I(100_000));
  }
  return { owner, reserve, vestOwner, alice, bob, carol, mallory, member, usdt, token, vesting, promo, staking, nft, nftSale };
}

module.exports = { deployAll, I, U, DAY, MONTH, nextTxAt, travel, now, cards };
