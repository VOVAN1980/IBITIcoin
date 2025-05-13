// scripts/verify-testnet.js
const hre = require("hardhat");
require("dotenv").config();

const { ethers } = hre;
const { parseUnits } = ethers;

async function verify(address, args = []) {
  try {
    console.log(`Verifying ${address} with args ${JSON.stringify(args)}`);
    await hre.run("verify:verify", {
      address,
      constructorArguments: args
    });
    console.log(`✅ Verified ${address}`);
  } catch (err) {
    console.warn(`❌ Failed verification for ${address}:`, err.message);
  }
}

async function main() {
  const {
    ERC20_MOCK_ADDRESS,
    FEE_MANAGER_ADDRESS,
    USER_STATUS_MANAGER_ADDRESS,
    BRIDGE_MANAGER_ADDRESS,
    NFTDISCOUNT_ADDRESS,
    IBITI_PRICE_ORACLE_ADDRESS,
    MOCK_UNISWAP_PAIR_ADDRESS,
    TEAM_VESTING_ADDRESS,
    TEAM_VESTING_START,
    TEAM_ALLOCATION,
    WALLET_ADDRESS,
    STAKING_MODULE_ADDRESS,
    DAO_MODULE_ADDRESS,
    IBITI_TOKEN_ADDRESS,
    IBITINFT_ADDRESS,
    NFTSALEMANAGER_ADDRESS,
    BUYBACK_MANAGER_ADDRESS,
    MOCK_ROUTER_ADDRESS,
    BURN_ADDRESS
  } = process.env;

  // расчёт тех же значений, что в deploy
  const initialBalance = parseUnits("100000000", 8).toString();
  const vestAmt        = parseUnits(TEAM_ALLOCATION, 8).toString();
  const vestStart      = Number(TEAM_VESTING_START);

  // 1) ERC20Mock(name, symbol, deployer, initialBalance)
  await verify(ERC20_MOCK_ADDRESS, [
    "MockUSDT",
    "mUSDT",
    WALLET_ADDRESS,
    initialBalance
  ]);

  // 2) FeeManager(stable.target)
  await verify(FEE_MANAGER_ADDRESS, [
    ERC20_MOCK_ADDRESS
  ]);

  // 3) UserStatusManager()
  await verify(USER_STATUS_MANAGER_ADDRESS, []);

  // 4) BridgeManager()
  await verify(BRIDGE_MANAGER_ADDRESS, []);

  // 5) NFTDiscount()
  await verify(NFTDISCOUNT_ADDRESS, []);

  // 6) VolumeWeightedOracle(decimals)
  await verify(IBITI_PRICE_ORACLE_ADDRESS, [
    18
  ]);

  // 7) MockUniswapV2Pair(reserve0, reserve1)
  await verify(MOCK_UNISWAP_PAIR_ADDRESS, [
    parseUnits("50000", 18).toString(),
    parseUnits("50000", 18).toString()
  ]);

  // 8) TeamVesting(vestAmt, start, beneficiary)
  await verify(TEAM_VESTING_ADDRESS, [
    vestAmt,
    vestStart,
    WALLET_ADDRESS
  ]);

  // 9) StakingModule(stable.target, nd.target)
  await verify(STAKING_MODULE_ADDRESS, [
    ERC20_MOCK_ADDRESS,
    NFTDISCOUNT_ADDRESS
  ]);

  // 10) DAOModuleImplementation(stable.target, nd.target)
  await verify(DAO_MODULE_ADDRESS, [
    ERC20_MOCK_ADDRESS,
    NFTDISCOUNT_ADDRESS
  ]);

  // 11) IBITIcoin(name, symbol, founder, reserve, feeMgr, userStatusMgr, bridgeMgr, stakingMod, daoMod)
  await verify(IBITI_TOKEN_ADDRESS, [
    "IBITIcoin",
    "IBITI",
    WALLET_ADDRESS,
    WALLET_ADDRESS,
    FEE_MANAGER_ADDRESS,
    USER_STATUS_MANAGER_ADDRESS,
    BRIDGE_MANAGER_ADDRESS,
    STAKING_MODULE_ADDRESS,
    DAO_MODULE_ADDRESS
  ]);

  // 12) IBITINFT(name, symbol, priceTokenUnits, priceEthUnits, supplyCap, discountPct, ibiToken)
  await verify(IBITINFT_ADDRESS, [
    "IBITI NFT",
    "IBINFT",
    parseUnits("1", 8).toString(),
    parseUnits("1", 8).toString(),
    500,
    10,
    IBITI_TOKEN_ADDRESS
  ]);

  // 13) NFTSaleManager(nd.target, ibi.target, stable.target, vo.target)
  await verify(NFTSALEMANAGER_ADDRESS, [
    NFTDISCOUNT_ADDRESS,
    IBITI_TOKEN_ADDRESS,
    ERC20_MOCK_ADDRESS,
    IBITI_PRICE_ORACLE_ADDRESS
  ]);

  // 14) BuybackManager(ibi.target, stable.target, router, [stable, ibi], burnAddr, burnPct)
  await verify(BUYBACK_MANAGER_ADDRESS, [
    IBITI_TOKEN_ADDRESS,
    ERC20_MOCK_ADDRESS,
    MOCK_ROUTER_ADDRESS,
    [ERC20_MOCK_ADDRESS, IBITI_TOKEN_ADDRESS],
    BURN_ADDRESS,
    Number(process.env.BUYBACK_BURN_PERCENT || 50)
  ]);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Script failed:", err);
    process.exit(1);
  });
