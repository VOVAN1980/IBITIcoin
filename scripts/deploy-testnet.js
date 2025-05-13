require('dotenv').config();
const hre = require('hardhat');
const { ethers } = hre;
const { parseUnits } = ethers;

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`⚡️ Deploying from: ${deployer.address}`);
  await sleep(3000);

  // 1. ERC20Mock (USDT)
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const stable = await ERC20Mock.deploy(
    'MockUSDT',
    'mUSDT',
    deployer.address,
    parseUnits('100000000', 8)
  );
  await stable.waitForDeployment();
  console.log(`ERC20Mock at ${stable.target}`);
  await sleep(3000);

  // 2. FeeManager
  const FeeManager = await ethers.getContractFactory('FeeManager');
  const feeManager = await FeeManager.deploy(stable.target);
  await feeManager.waitForDeployment();
  console.log(`FeeManager at ${feeManager.target}`);
  await sleep(3000);

  // 3. UserStatusManager
  const USM = await ethers.getContractFactory('UserStatusManager');
  const usm = await USM.deploy();
  await usm.waitForDeployment();
  console.log(`UserStatusManager at ${usm.target}`);
  await sleep(3000);

  // 4. BridgeManager
  const BM = await ethers.getContractFactory('BridgeManager');
  const bm = await BM.deploy();
  await bm.waitForDeployment();
  console.log(`BridgeManager at ${bm.target}`);
  await sleep(3000);

  // 5. NFTDiscount
  const ND = await ethers.getContractFactory('NFTDiscount');
  const nd = await ND.deploy();
  await nd.waitForDeployment();
  console.log(`NFTDiscount at ${nd.target}`);
  await sleep(3000);

  // 6. Oracle + MockPair
  const VO = await ethers.getContractFactory('VolumeWeightedOracle');
  const vo = await VO.deploy(18);
  await vo.waitForDeployment();
  console.log(`VWOracle at ${vo.target}`);
  await sleep(3000);

  const MP = await ethers.getContractFactory('MockUniswapV2Pair');
  const mp = await MP.deploy(
    parseUnits('50000', 18),
    parseUnits('50000', 18)
  );
  await mp.waitForDeployment();
  await vo.addPool(mp.target);
  console.log(`MockPair at ${mp.target}`);
  await sleep(3000);

  // 7. TeamVesting
  const TV = await ethers.getContractFactory('TeamVesting');
  const vestAmt = parseUnits('10000000', 8);
  const now = Math.floor(Date.now()/1000);
  const tv = await TV.deploy(vestAmt, now, deployer.address);
  await tv.waitForDeployment();
  console.log(`TeamVesting at ${tv.target}`);
  await sleep(3000);

  // 8. StakingModule
  const SM = await ethers.getContractFactory('StakingModule');
  const sm = await SM.deploy(stable.target, nd.target);
  await sm.waitForDeployment();
  console.log(`StakingModule at ${sm.target}`);
  await sm.setTreasury(deployer.address);
  await sleep(3000);

  // 9. DAOModuleImplementation
  const DM = await ethers.getContractFactory('DAOModuleImplementation');
  const dm = await DM.deploy(stable.target, nd.target);
  await dm.waitForDeployment();
  console.log(`DAOModuleImpl at ${dm.target}`);
  await sleep(3000);

  // 10. IBITIcoin
  const IB = await ethers.getContractFactory('IBITIcoin');
  const ibi = await IB.deploy(
    'IBITIcoin',
    'IBITI',
    deployer.address,
    deployer.address,
    feeManager.target,
    usm.target,
    bm.target,
    sm.target,
    dm.target
  );
  await ibi.waitForDeployment();
  console.log(`IBITIcoin at ${ibi.target}`);
  await sleep(3000);

  // настройка TeamVesting
  await ibi.setFeeDisabled(deployer.address, true);
  await ibi.approve(tv.target, vestAmt);

  const setTokenTx = await tv.setTokenAddress(ibi.target);
  await setTokenTx.wait();
  console.log(`TeamVesting token → ${await tv.token()}`);
  await sleep(3000);

  await tv.depositTokens(vestAmt);
  console.log(`TeamVesting deposited ${vestAmt}`);
  await sleep(3000);

  // 11. IBITINFT
  const IN = await ethers.getContractFactory('IBITINFT');
  const inft = await IN.deploy(
    'IBITI NFT',
    'IBINFT',
    parseUnits('1',8),
    parseUnits('1',8),
    500,
    10,
    ibi.target
  );
  await inft.waitForDeployment();
  console.log(`IBITINFT at ${inft.target}`);
  await inft.setUSDTParameters(stable.target, parseUnits('1',8));
  await sleep(3000);

  // 12. NFTSaleManager
  const NSM = await ethers.getContractFactory('NFTSaleManager');
  const nsm = await NSM.deploy(
    nd.target,
    ibi.target,
    stable.target,
    vo.target
  );
  await nsm.waitForDeployment();
  console.log(`NFTSaleManager at ${nsm.target}`);
  await nsm.setNFTPrice(5, 100);
  await sleep(3000);

  // 13. MockRouter for BuybackManager
  const MR = await ethers.getContractFactory('MockRouter');
  const mr = await MR.deploy(ibi.target, 1);
  await mr.waitForDeployment();
  console.log(`MockRouter at ${mr.target}`);
  await sleep(3000);

  // 14. BuybackManager
  const BB = await ethers.getContractFactory('BuybackManager');
  const bb = await BB.deploy(
    ibi.target,
    stable.target,
    mr.target,
    [stable.target, ibi.target],
    '0x000000000000000000000000000000000000dEaD',
    50
  );
  await bb.waitForDeployment();
  console.log(`BuybackManager at ${bb.target}`);

  console.log('✅ Deployment complete');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
