// scripts/check-testnet.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🔎  Проверяем контракты от:", deployer.address);

  // 1) Адреса контрактов
  const addresses = {
    ERC20Mock:            "0xf15692dAF9963A46D8518bCE93EAbd20012C287e",
    IBITIcoin:            "0x685B7FFE8fEB439601EF597c6E7F08b7566a622f",
    FeeManager:           "0x4bb2d1E1a75a0B5c0963EF8e1760EC1C7cb3C0e7",
    UserStatusManager:    "0x7B7cA67f7e9F613AFBd191375fa2DF5bA9211D34",
    BridgeManager:        "0xb9B511F02B8cC6934585A8b9BDC995Ee89c31605",
    NFTDiscount:          "0x7d9294F0Fb9845C8060d5c630dc6D306a6F51FAe",
    VolumeWeightedOracle: "0x222E76b36B4C0A4121727a19d58010eB0c007d57",
    TeamVesting:          "0x499b9F15D8ab03eC8FB0D285C622B26a19685fa5",
    StakingModule:        "0x4Ef7b929B6D685e8a4eD7C1d9D31a6603A7a589d",
    DAOModuleImpl:        "0x37dD8412e1499f1CF9d091baf358B823D14BC4C6",
    IBITINFT:             "0x1EE84a0b3685c2B8142138Cf4F55fD75CDE2ccC8",
    NFTSaleManager:       "0xA1C56109B5b4fd740b51A03D3dA3507f527EA90b",
    BuybackManager:       "0x20823848D1606c21C1102cf68d07cff89516Cf0D"
  };

  // 2) Подготовка фабрик
  const [
    ERC20Mock,
    IBITIcoin,
    FeeMgr,
    USM,
    Bridge,
    NFTDisc,
    Oracle,
    Vest,
    Stake,
    DAO,
    IBITINFT,
    Sale,
    Buyback
  ] = await Promise.all([
    ethers.getContractFactory("ERC20Mock"),
    ethers.getContractFactory("IBITIcoin"),
    ethers.getContractFactory("FeeManager"),
    ethers.getContractFactory("UserStatusManager"),
    ethers.getContractFactory("BridgeManager"),
    ethers.getContractFactory("NFTDiscount"),
    ethers.getContractFactory("VolumeWeightedOracle"),
    ethers.getContractFactory("TeamVesting"),
    ethers.getContractFactory("StakingModule"),
    ethers.getContractFactory("DAOModuleImplementation"),
    ethers.getContractFactory("IBITINFT"),
    ethers.getContractFactory("NFTSaleManager"),
    ethers.getContractFactory("BuybackManager"),
  ]);

  // 3) Прикрепление к адресу
  const erc20    = ERC20Mock.attach(addresses.ERC20Mock);
  const ibiti    = IBITIcoin.attach(addresses.IBITIcoin);
  const feeMgr   = FeeMgr.attach(addresses.FeeManager);
  const usm      = USM.attach(addresses.UserStatusManager);
  const bridge   = Bridge.attach(addresses.BridgeManager);
  const nftDisc  = NFTDisc.attach(addresses.NFTDiscount);
  const oracle   = Oracle.attach(addresses.VolumeWeightedOracle);
  const vest     = Vest.attach(addresses.TeamVesting);
  const staking  = Stake.attach(addresses.StakingModule);
  const dao      = DAO.attach(addresses.DAOModuleImpl);
  const ibitinft = IBITINFT.attach(addresses.IBITINFT);
  const sale     = Sale.attach(addresses.NFTSaleManager);
  const buyback  = Buyback.attach(addresses.BuybackManager);

  // 4) Базовые проверки

  console.log("📋 1) ERC20Mock.balanceOf(deployer):", (await erc20.balanceOf(deployer.address)).toString());
  console.log("📋 2) IBITI.totalSupply():",          (await ibiti.totalSupply()).toString());
  console.log("📋 3) IBITI.balanceOf(deployer):",      (await ibiti.balanceOf(deployer.address)).toString());
  console.log("📋 4) FeeManager.baseSellFee():",       (await feeMgr.baseSellFee()).toString());           // :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}
  console.log("📋 5) USM.isFlaggedBot(deployer):",     await usm.isFlaggedBot(deployer.address));          // :contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
  console.log("📋 6) Bridge.router():",               await bridge.router());                             // :contentReference[oaicite:4]{index=4}:contentReference[oaicite:5]{index=5}
  console.log("📋 7) NFTDiscount.discountData(0):",    await nftDisc.discountData(0));                     // :contentReference[oaicite:6]{index=6}:contentReference[oaicite:7]{index=7}
  console.log("📋 8) Oracle.getPrice():",             (await oracle.getPrice()).toString());             // :contentReference[oaicite:8]{index=8}:contentReference[oaicite:9]{index=9}

  // 9) TeamVesting: берём totalVested из getVestingInfo()
  const [totalVested, locked, pending] = await vest.getVestingInfo();
  console.log("📋 9) Vesting.totalVested:", totalVested.toString(), "locked:", locked.toString(), "pending:", pending.toString()); // :contentReference[oaicite:10]{index=10}:contentReference[oaicite:11]{index=11}

  // 10) StakingModule: конфиг наград за 6-месячный стейк
  const cfg6 = await staking.rewardConfigs(6);
  console.log(
    "📋10) Staking.rewardConfigs(6): nftCount =", 
    cfg6.nftCount.toString(), 
    ", discountPercent =", 
    cfg6.discountPercent.toString()
  );                                                                                                                        // :contentReference[oaicite:12]{index=12}:contentReference[oaicite:13]{index=13}

  console.log("📋11) DAO.getProposalCount():",        (await dao.getProposalCount()).toString());                     // :contentReference[oaicite:14]{index=14}:contentReference[oaicite:15]{index=15}

  // 12) IBITINFT: текущий nextTokenId (количество выпущенных NFT)
  console.log("📋12) IBITINFT.nextTokenId():",        (await ibitinft.nextTokenId()).toString());                     // :contentReference[oaicite:16]{index=16}:contentReference[oaicite:17]{index=17}

  // 13) NFTSaleManager: оракул может revert’ить цену
  console.log("📋13) Sale.oracleEnabled():",          await sale.oracleEnabled());                                   // :contentReference[oaicite:18]{index=18}:contentReference[oaicite:19]{index=19}
  try {
    const priceIBITI = await sale.getCurrentIBITIPrice(0);
    console.log("     getCurrentIBITIPrice(0):", priceIBITI.toString());
  } catch {
    console.log("     getCurrentIBITIPrice(0): price not set or oracle disabled");
  }

  // 14) BuybackManager: путь и burnPercent — с защитой от revert
  console.log("📋14) Buyback.path(0):",              await buyback.path(0));                                       // :contentReference[oaicite:20]{index=20}:contentReference[oaicite:21]{index=21}
  try {
    const bp = await buyback.burnPercent();
    console.log("     burnPercent():", bp.toString());
  } catch {
    console.log("     burnPercent(): unable to read (contract paused or revert)");                                   // :contentReference[oaicite:22]{index=22}:contentReference[oaicite:23]{index=23}
  }

  console.log("\n✅ Все проверки завершены успешно.");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n❌ Ошибка в check-testnet:", err);
    process.exit(1);
  });
