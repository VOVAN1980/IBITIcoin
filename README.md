<p align="center">
  <img src="img/logo.png" alt="logo.png" width="160">
</p>

# IBITIcoin

Modular decentralized ecosystem on **BNB Smart Chain (BEP-20, 8 decimals)** with on-chain governance, staking, NFT utilities, dynamic fees and a production IBITI/USDT pool on PancakeSwap V2.

---

## 🔍 What is in this repo

This repository contains the **core IBITIcoin smart-contract suite**, deployment scripts and project documentation:

- `IBITIcoin.sol` – main BEP-20 token of the ecosystem with:
  - dynamic buy/sell fees  
  - integration with the fee manager, staking and sale modules  
  - supply cap: **100,000,000 IBITI** (8 decimals)

- `StakingModule.sol` – fixed-term staking (1–12 months) with configurable APR, penalties for early exit and owner-controlled parameters.

- `BuybackManager.sol` – automated buyback & burn logic that can be funded from protocol revenue to support secondary-market liquidity and price stability.

- `DAOModule.sol` / `DAOModuleImplementation.sol` – on-chain DAO:
  - proposal + voting engine  
  - execution hooks for key protocol parameters

- `NFTDiscount.sol` – discount engine:
  - links **IBITI NFTs** to reduced fees / prices  
  - discount depends on NFT rarity and configured tiers.

- `NFTSaleManager.sol` – NFT sale controller:
  - price tiers  
  - optional vesting of bought NFTs / rewards  
  - integration with `NFTDiscount` for cheaper purchases.

- `BridgeManager.sol` – cross-chain bridge manager for future IBITI deployments on other networks.

- `UserStatusManager.sol` – centralized user status registry:
  - block / freeze flags  
  - KYC / AML status  
  - can be checked by other modules before executing actions.

- `VolumeWeightedOracle.sol` – internal oracle used mainly for **dynamic fee calculation** based on recent trading volume and activity.

- `FeeManager.sol` – flexible fee configuration:
  - buy/sell fees  
  - volatility-based tiers  
  - integration with NFT discounts and oracle.

- `PhasedTokenSale.sol` – multi-phase token sale:
  - fixed price per phase  
  - per-phase caps and timing  
  - optional fallback sale mode.

- `IBITINFT.sol` – ERC-721 collection for official IBITI NFTs (rarity, discounts, access rights).

- `TeamVesting.sol` – linear vesting for team/advisor allocations with cliffs and schedules.

- `ERC20Mock.sol` and mock pair/router contracts – helpers for local testing of swaps, fees and integrations.

---

## ⚙️ Core functionality

From the user / protocol point of view IBITIcoin supports:

- Token purchases with:
  - NFT-based discounts  
  - dynamic trading fees

- **Jackpot / airdrop mechanics** (configurable) on token buys

- **Dynamic fees** driven by:
  - recent trading volume  
  - oracle data  
  - user status (e.g. special tiers, blocked users)

- **Automatic buyback & burn** to support long-term price stability

- **Staking** with rewards and optional early-exit penalties

- **On-chain DAO voting** controlling protocol parameters

- **NFT sales** with possible vesting, discounts and gated access

- **Cross-chain bridge hooks** (bridge manager is already deployed, bridge UI/integration is planned)

- **User status control** (block / freeze / KYC flags) that other modules can respect.

---

## 🌐 Official links

- Website: **https://www.ibiticoin.com/**
- Twitter / X: **https://x.com/ibiticoin**
- Facebook: **https://www.facebook.com/ibiticoin.ibiticoin**
- Telegram (community chat): **https://t.me/IBITIcoin_chat**
- LinkedIn: **https://www.linkedin.com/in/ibiticoin**

---

## 📁 Repository structure

```text
contracts/                 # All Solidity contracts (core + modules + mocks)
img/                       # Logos and branding assets (logo.png, coin.png, etc.)
scripts/                   # Hardhat deploy / verify / maintenance scripts

.env.example               # Template for local environment variables
hardhat.config.js          # Hardhat networks & compiler config
package.json               # NPM project file
LICENSE.md                 # MIT license
README.md                  # You are here

IBITI_business_plan.pdf    # Business plan (EN/RU)
Token Schedule & Vesting.docx
Whitepaper_IBITI.pdf       # Whitepaper (EN)
🪙 Token basics (mainnet)
Network: BNB Smart Chain (BSC, chainId 56)

Standard: BEP-20

Name: IBITIcoin

Symbol: IBITI

Decimals: 8

Max supply cap: 100,000,000 IBITI

Mainnet token address

text
Копировать код
IBITI_TOKEN_ADDRESS_MAINNET = 0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb
Primary liquidity pair (PancakeSwap V2)

text
Копировать код
IBITI / USDT pair (V2) = 0xADfb9F0f810311e9c01C27B380909A5FfC104Be0
Router (V2)            = 0x10ED43C718714eb63d5aA57B78B54704E256024E
USDT (BSC)             = 0x55d398326f99059fF775485246999027B3197955
⚡ Hardhat & environment
1. Install
bash
Копировать код
git clone https://github.com/VOVAN1980/IBITIcoin.git
cd IBITIcoin
npm install
2. Environment
Copy the template and edit:

bash
Копировать код
cp .env.example .env
Key variables (names only, values are private):

env
Копировать код
# RPC endpoints
BSC_MAINNET_RPC_URL=
BSC_TESTNET_RPC_URL=

# Testnet private key (for bscTestnet)
PRIVATE_KEY=

# Ledger / deployment wallets
FOUNDER_WALLET=
RESERVE_WALLET=

# BscScan API key for verification
BSCSCAN_API_KEY=

# Core mainnet addresses
USDT_TOKEN_ADDRESS_MAINNET=
PANCAKESWAP_ROUTER_ADDRESS_MAINNET=

FEE_MANAGER_ADDRESS_MAINNET=
USER_STATUS_MANAGER_ADDRESS_MAINNET=
BRIDGE_MANAGER_ADDRESS_MAINNET=
NFTDISCOUNT_ADDRESS_MAINNET=
IBITI_PRICE_ORACLE_ADDRESS_MAINNET=
TEAM_VESTING_ADDRESS_MAINNET=
IBITINFT_ADDRESS_MAINNET=
IBITI_TOKEN_ADDRESS_MAINNET=
STAKING_MODULE_ADDRESS_MAINNET=
DAO_MODULE_ADDRESS_MAINNET=
PHASED_TOKENSALE_ADDRESS_MAINNET=
NFTSALEMANAGER_ADDRESS_MAINNET=
BUYBACK_MANAGER_ADDRESS_MAINNET=

# Optional script parameters (treasury top-ups, liquidity, jackpots, etc.)
TREASURY_TO_RESERVE_AMOUNT=
LIQ_IBITI_AMOUNT=
LIQ_USDT_AMOUNT=
LIQ_SLIPPAGE_BPS=
JACKPOT_PERCENT=
Check .env.example for the full and up-to-date list of parameters.

3. Networks (Hardhat)
Configured in hardhat.config.js:

hardhat – local in-memory network

localhost – external node at 127.0.0.1:8545

bscTestnet – BSC testnet via PRIVATE_KEY

bsc – BSC mainnet via Ledger (founder wallet)

bscReserve – BSC mainnet via Ledger (reserve wallet)

🛠 Common Hardhat commands
Compile contracts:

bash
Копировать код
npx hardhat compile
Run tests:

bash
Копировать код
npx hardhat test
Deploy to BSC mainnet (Ledger signer):

bash
Копировать код
npx hardhat run scripts/deploy-mainnet.js --network bsc
Verify deployed contracts on BscScan mainnet:

bash
Копировать код
npx hardhat run scripts/verify-mainnet.js --network bsc
(For testnet, use --network bscTestnet with the appropriate deploy/verify scripts and addresses.)

📦 Deployed contracts (BSC Testnet)
For historical reference and testing:

text
Копировать код
FEE_MANAGER_ADDRESS            = 0xeF25d90ad6911bF25a56D1A2b154db79C7979143
USER_STATUS_MANAGER_ADDRESS    = 0x8Afd09f0394836E39B6B88Ad5101d5B826f836F9
BRIDGE_MANAGER_ADDRESS         = 0x9F95A8711392329065a290d7ec62F02C4D37441B
NFTDISCOUNT_ADDRESS            = 0x29cE5782d4e7D97f06C0E7b6d5D4f92264f1519a
IBITI_PRICE_ORACLE_ADDRESS     = 0x9A2452F1517dF7e55b132De8F5268B9b56Cb37ae
TEAM_VESTING_ADDRESS           = 0x1F7F2C95fdb9a206e6deac95CfCad176CFb36110
STAKING_MODULE_ADDRESS         = 0xC1792854bD81AF5b1Fb326e0880365F76EA279EA
DAO_MODULE_ADDRESS             = 0x3eb4eCc5B7035626335d2D032a17dEDc3a9C9c62
IBITI_TOKEN_ADDRESS            = 0xc230f9394875305ac83013C0186a400865bc8f86
IBITINFT_ADDRESS               = 0xF7d5Fe8586FFf60b8905dB4b84B7bDafB1199545
NFTSALEMANAGER_ADDRESS         = 0xA789e8E13F1Fec071cd2dd418438C35Dba130472
BUYBACK_MANAGER_ADDRESS        = 0x64c77f7E9D42892488e77A4417D67A4667823e7E
PHASED_TOKENSALE_ADDRESS       = 0x3141940d64fE4B40c6d1D5148B6B45473F83bD5f
🧠 Deployed contracts (BSC Mainnet)
text
Копировать код
USDT_TOKEN_ADDRESS_MAINNET             = 0x55d398326f99059fF775485246999027B3197955
PANCAKESWAP_ROUTER_ADDRESS_MAINNET    = 0x10ED43C718714eb63d5aA57B78B54704E256024E

FEE_MANAGER_ADDRESS_MAINNET           = 0x34770ba3625437742e18C6827DFC893c42Eec956
USER_STATUS_MANAGER_ADDRESS_MAINNET   = 0xf1C734156A2Ab62e1018D18f6347425623af611a
BRIDGE_MANAGER_ADDRESS_MAINNET        = 0x813d2d93a3EfDFe8B09513b09B7CbdE06B239113
NFTDISCOUNT_ADDRESS_MAINNET           = 0x911f7153AA7554b3f936f2ad05318B8368c14668
IBITI_PRICE_ORACLE_ADDRESS_MAINNET    = 0x09e28925487841f0400687FD9DC9cf1d14B85aF3
TEAM_VESTING_ADDRESS_MAINNET          = 0xae6fA65adede487e46ABCE1b3570063D02510d5d
IBITINFT_ADDRESS_MAINNET              = 0xE14bfBB10180eda4bDC574f02700e0E2BC0A4667
IBITI_TOKEN_ADDRESS_MAINNET           = 0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb
STAKING_MODULE_ADDRESS_MAINNET        = 0x9ad8D68F7a6C9f673bd1db8348734f8dA515113c
DAO_MODULE_ADDRESS_MAINNET            = 0xc0213d9d331Ea207717E38F5e0e995BA567fbd1F
PHASED_TOKENSALE_ADDRESS_MAINNET      = 0x6A6eDc85f4690DBAB98d52CdF656ef849d28148e
NFTSALEMANAGER_ADDRESS_MAINNET        = 0x2c702A42966a939b6C5Da4828cd8D67890Db097E
BUYBACK_MANAGER_ADDRESS_MAINNET       = 0xdE7E16bbDe9076daF23DB25BA4E50d8FEeca5AC9
Liquidity

text
Копировать код
IBITI/USDT PancakeSwap V2 pair = 0xADfb9F0f810311e9c01C27B380909A5FfC104Be0
🤝 Contributing
Fork this repository

Create a feature branch: feature/<your-feature>

Add your changes with tests

Open a Pull Request

Please keep PRs small and focused (one feature or bugfix per PR) and describe any contract-level changes clearly.

📚 Documentation
Full docs are shipped in this repo:

Whitepaper_IBITI.pdf – main whitepaper (EN)

IBITI_business_plan.pdf – business / tokenomics overview

Token Schedule & Vesting.docx – detailed allocation & vesting model

Additional docs and diagrams may appear over time as the ecosystem grows.

📄 License
This project is released under the MIT License.
See LICENSE.md for details.

makefile
Копировать код

