// scripts/deploy-mainnet.js
require("dotenv").config();
const { ethers } = require("hardhat");

// ----------------- helpers -----------------

function needEnv(key, msg) {
  const v = (process.env[key] || "").trim();
  if (!v) {
    throw new Error(`ENV ${key} is required${msg ? `: ${msg}` : ""}`);
  }
  return v;
}

// deploy or attach by env
async function deployOrAttach(label, artifact, envKey, deployFn) {
  const existing = (process.env[envKey] || "").trim();
  if (existing) {
    console.log(`⏭ ${label} already deployed at: ${existing} (from ${envKey})`);
    return await ethers.getContractAt(artifact, existing);
  }

  console.log(`▶ Deploying ${label} (no ${envKey} in .env) ...`);
  const c = await deployFn();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`✅ ${label} deployed at: ${addr}`);
  console.log(`   👉 add to .env: ${envKey}=${addr}`);
  return c;
}

// безопасный вызов (не роняем скрипт)
async function safeCall(label, contract, fn, args = []) {
  if (!contract[fn]) {
    console.log(`⏭ ${label}.${fn} not in ABI, skipping`);
    return;
  }

  const prettyArgs = args.map((a) =>
    typeof a === "string" ? a : a?.toString?.() ?? String(a)
  );
  console.log(`🔧 ${label}.${fn}(${prettyArgs.join(", ")})`);

  try {
    const tx = await contract[fn](...args);
    const rc = await tx.wait();
    console.log(`✅ ${label}.${fn} tx: ${rc.hash}`);
  } catch (e) {
    const reason =
      e?.info?.error?.message ||
      e?.error?.message ||
      e?.message ||
      "unknown error";
    console.log(`⚠ ${label}.${fn} failed: ${reason}`);
  }
}

// ----------------- main -----------------

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  console.log("====================================");
  console.log(" Deploy / wire FULL IBITI stack");
  console.log(` Network : ${net.name} (chainId=${chainId})`);
  console.log(` Deployer: ${deployer.address}`);
  console.log("====================================");

  const isTestnet = chainId === 97; // bscTestnet
  const isMainnet = chainId === 56; // BSC mainnet (и hardhat-fork с тем же chainId)

  if (!isTestnet && !isMainnet) {
    throw new Error(
      "This script is intended for bscTestnet(97) or BSC mainnet(56)"
    );
  }

  // -------- network-specific config --------

  const usdtAddr = isTestnet
    ? needEnv("USDT_TOKEN_ADDRESS_TESTNET", "USDT on testnet")
    : needEnv("USDT_TOKEN_ADDRESS_MAINNET", "USDT on mainnet");

  const feeMgrAddr = isTestnet
    ? needEnv("FEE_MANAGER_ADDRESS", "FeeManager on testnet")
    : needEnv("FEE_MANAGER_ADDRESS_MAINNET", "FeeManager on mainnet");

  const userStatusMgrAddr = isTestnet
    ? needEnv("USER_STATUS_MANAGER_ADDRESS", "UserStatusManager on testnet")
    : needEnv(
        "USER_STATUS_MANAGER_ADDRESS_MAINNET",
        "UserStatusManager on mainnet"
      );

  const bridgeMgrAddr = isTestnet
    ? needEnv("BRIDGE_MANAGER_ADDRESS", "BridgeManager on testnet")
    : needEnv("BRIDGE_MANAGER_ADDRESS_MAINNET", "BridgeManager on mainnet");

  const nftDiscountAddr = isTestnet
    ? needEnv("NFTDISCOUNT_ADDRESS", "NFTDiscount on testnet")
    : needEnv("NFTDISCOUNT_ADDRESS_MAINNET", "NFTDiscount on mainnet");

  const oracleAddr = isTestnet
    ? needEnv("IBITI_PRICE_ORACLE_ADDRESS", "IBITI oracle on testnet")
    : needEnv(
        "IBITI_PRICE_ORACLE_ADDRESS_MAINNET",
        "IBITI oracle on mainnet"
      );

  const routerAddr = isTestnet
    ? needEnv("PANCAKESWAP_ROUTER_ADDRESS", "router on testnet")
    : needEnv("PANCAKESWAP_ROUTER_ADDRESS_MAINNET", "router on mainnet");

  const founderWallet = isMainnet
    ? needEnv("FOUNDER_WALLET", "founder/distribution wallet (Ledger)")
    : (process.env.FOUNDER_WALLET || "").trim() || deployer.address;

  const reserveWallet = isMainnet
    ? needEnv("RESERVE_WALLET", "reserve wallet (Ledger)")
    : (process.env.RESERVE_WALLET || "").trim() || deployer.address;

  const burnWallet =
    (process.env.BURN_ADDRESS || "").trim() || founderWallet;

  const jackpotPercent = parseInt(
    (process.env.JACKPOT_PERCENT || "5").trim(),
    10
  );

  const ipfsCid =
    (process.env.AIRDROP_IPFS_CID ||
      process.env.IPFS_CID ||
      "").trim();

  const buybackBurnPercent = parseInt(
    (process.env.BUYBACK_BURN_PERCENT || "50").trim(),
    10
  );

  const teamVestingAddr = isTestnet
    ? (process.env.TEAM_VESTING_ADDRESS || "").trim()
    : (process.env.TEAM_VESTING_ADDRESS_MAINNET || "").trim();

  const ibitiNftAddr = isTestnet
    ? (process.env.IBITINFT_ADDRESS || "").trim()
    : (process.env.IBITINFT_ADDRESS_MAINNET || "").trim();

  console.log("USDT address        :", usdtAddr);
  console.log("FeeManager          :", feeMgrAddr);
  console.log("UserStatusManager   :", userStatusMgrAddr);
  console.log("BridgeManager       :", bridgeMgrAddr);
  console.log("NFTDiscount         :", nftDiscountAddr);
  console.log("Oracle              :", oracleAddr);
  console.log("Router              :", routerAddr);
  console.log("TeamVesting (env)   :", teamVestingAddr || "(not set)");
  console.log("IBITINFT (env)      :", ibitiNftAddr || "(not set)");
  console.log("Founder wallet      :", founderWallet);
  console.log("Reserve wallet      :", reserveWallet);
  console.log("Burn wallet         :", burnWallet);
  console.log("Buyback burn %      :", buybackBurnPercent);
  console.log("------------------------------------");

  // -------- attach external modules (уже задеплоены) --------

  const feeManager = await ethers.getContractAt("FeeManager", feeMgrAddr);
  const userStatusManager = await ethers.getContractAt(
    "UserStatusManager",
    userStatusMgrAddr
  );
  const bridgeManager = await ethers.getContractAt(
    "BridgeManager",
    bridgeMgrAddr
  );
  const nftDiscount = await ethers.getContractAt(
    "NFTDiscount",
    nftDiscountAddr
  );
  const oracle = await ethers.getContractAt(
    "VolumeWeightedOracle",
    oracleAddr
  );
  const usdt = await ethers.getContractAt("IERC20Metadata", usdtAddr);

  let teamVesting = null;
  if (teamVestingAddr) {
    console.log("ℹ attaching TeamVesting");
    teamVesting = await ethers.getContractAt("TeamVesting", teamVestingAddr);
  }

  const ibitiNft = ibitiNftAddr
    ? await ethers.getContractAt("IBITINFT", ibitiNftAddr)
    : null;

  console.log("USDT decimals:", await usdt.decimals());

  // -------- env keys для основного стека --------

  const ibitiEnvKey = isTestnet
    ? "IBITI_TOKEN_ADDRESS"
    : "IBITI_TOKEN_ADDRESS_MAINNET";

  const stakingEnvKey = isTestnet
    ? "STAKING_MODULE_ADDRESS"
    : "STAKING_MODULE_ADDRESS_MAINNET";

  const daoEnvKey = isTestnet
    ? "DAO_MODULE_ADDRESS"
    : "DAO_MODULE_ADDRESS_MAINNET";

  const phasedEnvKey = isTestnet
    ? "PHASED_TOKENSALE_ADDRESS"
    : "PHASED_TOKENSALE_ADDRESS_MAINNET";

  const nftSaleEnvKey = isTestnet
    ? "NFTSALEMANAGER_ADDRESS"
    : "NFTSALEMANAGER_ADDRESS_MAINNET";

  const buybackEnvKey = isTestnet
    ? "BUYBACK_MANAGER_ADDRESS"
    : "BUYBACK_MANAGER_ADDRESS_MAINNET";

  // -------- deploy / attach: IBITIcoin --------

  const ibiti = await deployOrAttach(
    "IBITIcoin",
    "IBITIcoin",
    ibitiEnvKey,
    async () => {
      const F = await ethers.getContractFactory("IBITIcoin");
      return await F.deploy(
        "IBITIcoin",
        "IBITI",
        founderWallet,
        reserveWallet,
        feeMgrAddr,
        userStatusMgrAddr,
        bridgeMgrAddr,
        ethers.ZeroAddress, // stakingModule (wire later)
        ethers.ZeroAddress  // daoModule (wire later)
      );
    }
  );
  const ibitiAddr = await ibiti.getAddress();

  // -------- deploy / attach: StakingModule --------

  const staking = await deployOrAttach(
    "StakingModule",
    "StakingModule",
    stakingEnvKey,
    async () => {
      const F = await ethers.getContractFactory("StakingModule");
      return await F.deploy(ibitiAddr, nftDiscountAddr);
    }
  );
  const stakingAddr = await staking.getAddress();

  // -------- deploy / attach: DAOModuleImplementation --------

  const dao = await deployOrAttach(
    "DAOModuleImplementation",
    "DAOModuleImplementation",
    daoEnvKey,
    async () => {
      const F = await ethers.getContractFactory("DAOModuleImplementation");
      return await F.deploy(ibitiAddr, nftDiscountAddr);
    }
  );
  const daoAddr = await dao.getAddress();

  // -------- deploy / attach: PhasedTokenSale --------

  const phased = await deployOrAttach(
    "PhasedTokenSale",
    "PhasedTokenSale",
    phasedEnvKey,
    async () => {
      const F = await ethers.getContractFactory("PhasedTokenSale");
      const refReserve = 0;
      const volReserve = 0;
      return await F.deploy(ibitiAddr, usdtAddr, refReserve, volReserve);
    }
  );
  const phasedAddr = await phased.getAddress();

  // -------- deploy / attach: NFTSaleManager --------

  const nftSale = await deployOrAttach(
    "NFTSaleManager",
    "NFTSaleManager",
    nftSaleEnvKey,
    async () => {
      const F = await ethers.getContractFactory("NFTSaleManager");
      return await F.deploy(
        nftDiscountAddr,
        ibitiAddr,
        usdtAddr,
        oracleAddr
      );
    }
  );
  const nftSaleAddr = await nftSale.getAddress();

  // -------- deploy / attach: BuybackManager --------

  const buybackPayTokenAddr = usdtAddr;
  const buybackPath = [buybackPayTokenAddr, ibitiAddr];

  const buyback = await deployOrAttach(
    "BuybackManager",
    "BuybackManager",
    buybackEnvKey,
    async () => {
      const F = await ethers.getContractFactory("BuybackManager");
      return await F.deploy(
        ibitiAddr,
        buybackPayTokenAddr,
        routerAddr,
        buybackPath,
        burnWallet,
        buybackBurnPercent
      );
    }
  );
  const buybackAddr = await buyback.getAddress();

  // -------- wiring (binding) --------

  console.log("\n====================================");
  console.log(" Wiring (binding) FULL stack.");
  console.log("====================================");

  // === IBITI wiring ===
  await safeCall("IBITI", ibiti, "setFeeManager", [feeMgrAddr]);
  await safeCall("IBITI", ibiti, "setUserStatusManager", [userStatusMgrAddr]);
  await safeCall("IBITI", ibiti, "setBridgeManager", [bridgeMgrAddr]);
  await safeCall("IBITI", ibiti, "setStakingModule", [stakingAddr]);
  await safeCall("IBITI", ibiti, "setDaoModule", [daoAddr]);
  await safeCall("IBITI", ibiti, "setNFTDiscount", [nftDiscountAddr]);

  // distributionWallet = founderWallet
  await safeCall("IBITI", ibiti, "setDistributionWallet", [founderWallet]);

  // Принимаем BNB и USDT как способы оплаты
  await safeCall("IBITI", ibiti, "setAcceptedPayment", [
    ethers.ZeroAddress,
    true,
  ]);
  await safeCall("IBITI", ibiti, "setAcceptedPayment", [usdtAddr, true]);

  // === FeeManager + UserStatusManager + TeamVesting ===

  // Привязываем IBITI к FeeManager (если owner совпадает — обновит; иначе safeCall просто залогирует реверт)
  await safeCall("FeeManager", feeManager, "setTokenContract", [ibitiAddr]);

  // Разовая привязка IBITI к UserStatusManager (если уже задан — будет реверт, но safeCall его поймает)
  await safeCall("UserStatusManager", userStatusManager, "setIBIToken", [
    ibitiAddr,
  ]);

  // Минимальная привязка TeamVesting к токену
  if (teamVesting) {
    await safeCall("TeamVesting", teamVesting, "setTokenAddress", [ibitiAddr]);
  }

  // === StakingModule wiring ===
  // Токен и NFTDiscount заданы конструктором, setToken / setNFTDiscount не трогаем.
  await safeCall("StakingModule", staking, "setTreasury", [founderWallet]);
  await safeCall("StakingModule", staking, "authorizeCaller", [
    ibitiAddr,
    true,
  ]);
  // Pausable по умолчанию не в паузе — unpause не нужен.

  // === DAO module wiring ===
  if (ipfsCid) {
    await safeCall("DAO", dao, "setVotingRewardBaseURI", [
      `ipfs://${ipfsCid}`,
    ]);
  }

  // === PhasedTokenSale wiring ===
  await safeCall("PhasedTokenSale", phased, "pause", []);
  await safeCall("PhasedTokenSale", phased, "setPaymentTokens", [
    ibitiAddr,
    usdtAddr,
  ]);
  await safeCall("PhasedTokenSale", phased, "unpause", []);

  // setAirdropParams — только когда контракт НЕ в паузе
  if (ipfsCid) {
    await safeCall("PhasedTokenSale", phased, "setAirdropParams", [
      jackpotPercent,
      `ipfs://${ipfsCid}`,
    ]);
  }

  // === NFTSaleManager wiring ===
  await safeCall("NFTSaleManager", nftSale, "pause", []);

  await safeCall("NFTSaleManager", nftSale, "setPaymentTokens", [
    ibitiAddr,
    usdtAddr,
  ]);

  await safeCall("NFTSaleManager", nftSale, "setNFTDiscount", [
    nftDiscountAddr,
  ]);

  // updateOracle — только whenPaused, так что вызываем до unpause
  await safeCall("NFTSaleManager", nftSale, "updateOracle", [oracleAddr]);

  await safeCall("NFTSaleManager", nftSale, "unpause", []);

  // === BuybackManager wiring ===
  await safeCall("BuybackManager", buyback, "pause", []);
  // setIbitiAndPath(newIbiti, newPath[])
  await safeCall("BuybackManager", buyback, "setIbitiAndPath", [
    ibitiAddr,
    [buybackPayTokenAddr, ibitiAddr],
  ]);
  // Buyback оставляем в паузе — включишь отдельно

  // === IBITINFT wiring ===
  // Никаких сеттеров для NFTDiscount/FeeManager в текущем контракте IBITINFT нет — ничего не трогаем.

  // Флаги IBITI: стартовая конфигурация комиссий
  // burnEnabled / distributionEnabled / purchaseFee / transferFee / saleFee / activityTracking
  await safeCall("IBITI", ibiti, "setFlags", [
    true,  // burnEnabled — сжигание по продаже
    true,  // distributionEnabled — распределение комиссий
    false, // purchaseFeeEnabled — без комиссии на покупку
    false, // transferFeeEnabled — без комиссии на обычные переводы
    true,  // saleFeeEnabled — комиссия на продажу включена
    false  // activityTrackingEnabled — пока выключено
  ]);

  console.log("\n====================================");
  console.log(" FINAL ADDRESSES / MODULES");
  console.log("====================================");
  console.log(" IBITIcoin              :", ibitiAddr);
  console.log(" StakingModule          :", stakingAddr);
  console.log(" DAOModuleImplementation:", daoAddr);
  console.log(" PhasedTokenSale        :", phasedAddr);
  console.log(" NFTSaleManager         :", nftSaleAddr);
  console.log(" BuybackManager         :", buybackAddr);
  console.log(" FeeManager             :", feeMgrAddr);
  console.log(" UserStatusManager      :", userStatusMgrAddr);
  console.log(" BridgeManager          :", bridgeMgrAddr);
  console.log(" NFTDiscount            :", nftDiscountAddr);
  console.log(" Oracle                 :", oracleAddr);
  console.log(" USDT                   :", usdtAddr);
  console.log(" TeamVesting            :", teamVestingAddr || "(not set)");
  console.log(" IBITINFT               :", ibitiNftAddr || "(not set)");
  console.log(" Founder wallet         :", founderWallet);
  console.log(" Reserve wallet         :", reserveWallet);
  console.log(" Burn wallet            :", burnWallet);
  console.log(" Buyback payment token  :", buybackPayTokenAddr);
  console.log("====================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
