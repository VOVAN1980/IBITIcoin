// scripts/verify-mainnet.js
require("dotenv").config();

const { ethers } = require("hardhat");

function needEnv(key) {
  const v = (process.env[key] || "").trim();
  if (!v) throw new Error(`ENV ${key} is required`);
  return v;
}

async function verify(label, address, args, contractPath) {
  const hre = require("hardhat");
  console.log(`\n=== Verifying ${label} at ${address} ===`);
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments: args,
      contract: contractPath, // "contracts/Name.sol:ContractName"
    });
    console.log(`✅ ${label} verified`);
  } catch (e) {
    const msg = e.message || e.toString();
    if (
      msg.includes("Already Verified") ||
      msg.includes("Contract source code already verified")
    ) {
      console.log(`ℹ ${label} already verified on BscScan`);
    } else {
      console.log(`⚠ ${label} verify failed: ${msg}`);
    }
  }
}

async function main() {
  const hre = require("hardhat");
  const net = await hre.ethers.provider.getNetwork();
  console.log("Network:", net.name, "chainId=", net.chainId);
  if (Number(net.chainId) !== 56) {
    throw new Error("Этот скрипт запускаем только с --network bsc (chainId=56)");
  }

  // ---- читаем ENV (mainnet-секция) ----
  const founderWallet = needEnv("FOUNDER_WALLET");
  const reserveWallet = needEnv("RESERVE_WALLET");

  const USDT = needEnv("USDT_TOKEN_ADDRESS_MAINNET");
  const ROUTER = needEnv("PANCAKESWAP_ROUTER_ADDRESS_MAINNET");

  const IBITI = needEnv("IBITI_TOKEN_ADDRESS_MAINNET");
  const STAKING = needEnv("STAKING_MODULE_ADDRESS_MAINNET");
  const DAO = needEnv("DAO_MODULE_ADDRESS_MAINNET");
  const PHASED = needEnv("PHASED_TOKENSALE_ADDRESS_MAINNET");
  const NFT_SALE = needEnv("NFTSALEMANAGER_ADDRESS_MAINNET");
  const BUYBACK = needEnv("BUYBACK_MANAGER_ADDRESS_MAINNET");
  const USER_STATUS = needEnv("USER_STATUS_MANAGER_ADDRESS_MAINNET");

  const FEE_MANAGER = needEnv("FEE_MANAGER_ADDRESS_MAINNET");
  const USER_STATUS_ADDR = needEnv("USER_STATUS_MANAGER_ADDRESS_MAINNET");
  const BRIDGE = needEnv("BRIDGE_MANAGER_ADDRESS_MAINNET");
  const NFT_DISCOUNT = needEnv("NFTDISCOUNT_ADDRESS_MAINNET");
  const ORACLE = needEnv("IBITI_PRICE_ORACLE_ADDRESS_MAINNET");

  const burnWallet =
    (process.env.BURN_ADDRESS || "").trim() || founderWallet;
  const buybackBurnPercent = parseInt(
    (process.env.BUYBACK_BURN_PERCENT || "50").trim(),
    10
  );

  // === 1) IBITIcoin ===
  await verify(
    "IBITIcoin",
    IBITI,
    [
      "IBITIcoin",
      "IBITI",
      founderWallet,
      reserveWallet,
      FEE_MANAGER,
      USER_STATUS_ADDR,
      BRIDGE,
      ethers.ZeroAddress, // stakingModule (wire later)
      ethers.ZeroAddress, // daoModule (wire later)
    ],
    "contracts/IBITIcoin.sol:IBITIcoin"
  );

  // === 2) StakingModule ===
  await verify(
    "StakingModule",
    STAKING,
    [
      IBITI,
      NFT_DISCOUNT, // второй аргумент из deploy-mainnet.js
    ],
    "contracts/StakingModule.sol:StakingModule"
  );

  // === 3) DAOModuleImplementation ===
  await verify(
    "DAOModuleImplementation",
    DAO,
    [
      IBITI,
      NFT_DISCOUNT,
    ],
    "contracts/DAOModuleImplementation.sol:DAOModuleImplementation"
  );

  // === 4) PhasedTokenSale ===
  await verify(
    "PhasedTokenSale",
    PHASED,
    [
      IBITI,
      USDT,
      0, // refReserve
      0, // volReserve
    ],
    "contracts/PhasedTokenSale.sol:PhasedTokenSale"
  );

  // === 5) NFTSaleManager ===
  await verify(
    "NFTSaleManager",
    NFT_SALE,
    [
      NFT_DISCOUNT,
      IBITI,
      USDT,
      ORACLE,
    ],
    "contracts/NFTSaleManager.sol:NFTSaleManager"
  );

  // === 6) BuybackManager ===
  await verify(
    "BuybackManager",
    BUYBACK,
    [
      IBITI,
      USDT,                             // payment token
      ROUTER,                           // Pancake router
      [USDT, IBITI],                    // path: USDT -> IBITI
      burnWallet,
      buybackBurnPercent,
    ],
    "contracts/BuybackManager.sol:BuybackManager"
  );

  // === 7) UserStatusManager (без конструктора) ===
  await verify(
    "UserStatusManager",
    USER_STATUS,
    [],
    "contracts/UserStatusManager.sol:UserStatusManager"
  );

  console.log("\n=== DONE: verify-mainnet finished ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
