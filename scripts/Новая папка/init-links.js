
// scripts/init-links.js
require('dotenv').config();
const { ethers } = require("hardhat");
const { parseUnits } = ethers;

async function safeSend(txPromise, description) {
  try {
    await txPromise;
    console.log(`  ↪ OK: ${description}`);
  } catch (err) {
    console.log(`  ↪ SKIP: ${description} (${err.error?.message || err.message})`);
  }
}

async function maybeUnpause(c, name) {
  try {
    const isPaused = await c.paused();
    if (isPaused) {
      await c.unpause();
      console.log(`  ↪ ${name} unpaused`);
    }
  } catch {}
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`🔗 Initializing links as: ${deployer.address}`);
  const toUnits = n => parseUnits(String(n), 8);

  // Читаем из .env
  const A = {
    ERC20Mock:        process.env.ERC20_MOCK_ADDRESS,
    IBITIcoin:        process.env.IBITI_TOKEN_ADDRESS,
    FeeManager:       process.env.FEE_MANAGER_ADDRESS,
    UserStatus:       process.env.USER_STATUS_MANAGER_ADDRESS,
    BridgeManager:    process.env.BRIDGE_MANAGER_ADDRESS,
    DAOModuleImpl:    process.env.DAO_MODULE_ADDRESS,
    StakingModule:    process.env.STAKING_MODULE_ADDRESS,
    NFTDiscount:      process.env.NFTDISCOUNT_ADDRESS,
    NFTSaleManager:   process.env.NFTSALEMANAGER_ADDRESS,
    VolumeOracle:     process.env.IBITI_PRICE_ORACLE_ADDRESS,
    TeamVesting:      process.env.TEAM_VESTING_ADDRESS,
  };

  // Подгружаем фабрики и attach по адресам
  const [F, IB, FM, USM, BM, DM, SM, ND, NSM, VO, TV] = await Promise.all([
    ethers.getContractFactory("ERC20Mock"),
    ethers.getContractFactory("IBITIcoin"),
    ethers.getContractFactory("FeeManager"),
    ethers.getContractFactory("UserStatusManager"),
    ethers.getContractFactory("BridgeManager"),
    ethers.getContractFactory("DAOModuleImplementation"),
    ethers.getContractFactory("StakingModule"),
    ethers.getContractFactory("NFTDiscount"),
    ethers.getContractFactory("NFTSaleManager"),
    ethers.getContractFactory("VolumeWeightedOracle"),
    ethers.getContractFactory("TeamVesting")
  ]);

  const erc20Mock = F.attach(A.ERC20Mock);
  const ibi       = IB.attach(A.IBITIcoin);
  const feeM      = FM.attach(A.FeeManager);
  const usm       = USM.attach(A.UserStatus);
  const bm        = BM.attach(A.BridgeManager);
  const daoM      = DM.attach(A.DAOModuleImpl);
  const sm        = SM.attach(A.StakingModule);
  const nd        = ND.attach(A.NFTDiscount);
  const nsm       = NSM.attach(A.NFTSaleManager);
  const vo        = VO.attach(A.VolumeOracle);
  const tv        = TV.attach(A.TeamVesting);

  // 1) IBITIcoin modules
  console.log("🧩 Linking IBITIcoin modules...");
  await safeSend(ibi.setFeeManager(A.FeeManager),      "setFeeManager");
  await safeSend(ibi.setUserStatusManager(A.UserStatus),"setUserStatusManager");
  await safeSend(ibi.setBridgeManager(A.BridgeManager),"setBridgeManager");
  await safeSend(ibi.setStakingModule(A.StakingModule),"setStakingModule");
  await safeSend(ibi.setDaoModule(A.DAOModuleImpl),    "setDaoModule");
  await safeSend(ibi.setNFTDiscount(A.NFTDiscount),    "setNFTDiscount");

  // 2) NFTDiscount (сначала payToken)
  console.log("🧩 Configuring NFTDiscount...");
  await maybeUnpause(nd, "NFTDiscount");
  await safeSend(nd.setPayToken(A.ERC20Mock),          "setPayToken");
  await safeSend(nd.setIbitiToken(A.IBITIcoin),        "setIbitiToken");
  await safeSend(nd.setDiscountOperator(A.NFTSaleManager), "setDiscountOperator");
  await safeSend(nd.setDAOModule(A.DAOModuleImpl),     "setDAOModule");
  await safeSend(nd.setStakingModule(A.StakingModule), "setStakingModule");
  await safeSend(nd.setNftPrice(toUnits(1)),           "setNftPrice");

  // 3) NFTSaleManager
  console.log("🧩 Configuring NFTSaleManager...");
  await maybeUnpause(nsm, "NFTSaleManager");
  await safeSend(nsm.setOracleEnabled(true),   "setOracleEnabled");
  await safeSend(nsm.setNFTPrice(5, 100),      "setNFTPrice");

  // 4) StakingModule
  console.log("🧩 Configuring StakingModule...");
  await maybeUnpause(sm, "StakingModule");
  await safeSend(sm.setNFTDiscount(A.NFTDiscount),"setNFTDiscount");
  await safeSend(sm.setTreasury(deployer.address), "setTreasury");
  await safeSend(sm.setAllowedCaller(A.IBITIcoin), "setAllowedCaller");

  // 5) FeeManager
  console.log("🧩 Configuring FeeManager...");
  await safeSend(feeM.setTokenContract(A.IBITIcoin), "setTokenContract");

  // 6) TeamVesting
  console.log("🧩 Verifying TeamVesting token...");
  const current = await tv.token().catch(()=>null);
  if (current !== A.IBITIcoin) {
    await safeSend(tv.setTokenAddress(A.IBITIcoin), "setTokenAddress");
  }

  console.log("\n✅ init-links.js done (best effort).");
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
