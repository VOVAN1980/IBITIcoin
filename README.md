<p align="center">
  <img src="img/logo.png" alt="IBITIcoin logo" width="160">
</p>

# IBITIcoin

**IBITIcoin (IBITI)** is a modular decentralized ecosystem built on  
**BNB Smart Chain (BEP-20)** with a strong focus on on-chain transparency,
governance, sustainability and long-term protocol development.

The project is designed as a set of independent smart-contract modules
that can be upgraded, extended or governed via on-chain mechanisms,
rather than a single monolithic contract.

---

## 🔑 Key Parameters

- Network: BNB Smart Chain (BSC)
- Chain ID: 56
- Standard: BEP-20
- Token name: IBITIcoin
- Symbol: IBITI
- Decimals: 8
- Max supply: 100,000,000 IBITI

**Mainnet token address**
0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb

markdown
Копировать код

**Primary liquidity**
- Pair: IBITI / USDT
- DEX: PancakeSwap V2

---

## 🧱 Architecture Overview

IBITIcoin is implemented as a modular smart-contract system.
Each component is responsible for a specific protocol function.

### Core contracts

- **IBITIcoin.sol**  
  Main BEP-20 token contract with fee hooks and integration points.

- **FeeManager.sol**  
  Centralized fee configuration module supporting:
  - buy/sell fees  
  - dynamic fee tiers  
  - oracle-driven adjustments  
  - NFT-based discounts

- **StakingModule.sol**  
  Fixed-term staking with configurable APR, lock periods and early-exit penalties.

- **BuybackManager.sol**  
  Buyback and burn logic funded from protocol revenue to support long-term
  liquidity and price stability.

- **DAOModule.sol / DAOModuleImplementation.sol**  
  On-chain governance system:
  - proposal creation  
  - voting  
  - execution of protocol parameter changes

- **NFTDiscount.sol**  
  Discount engine linking IBITI NFTs to reduced fees and special conditions.

- **NFTSaleManager.sol**  
  NFT sale controller with tiered pricing, optional vesting and discount support.

- **TeamVesting.sol**  
  Linear vesting contract with cliffs and schedules for team and advisors.

- **BridgeManager.sol**  
  Cross-chain expansion hooks for future IBITI deployments on other networks.

- **UserStatusManager.sol**  
  User status registry supporting:
  - block / freeze flags  
  - compliance states  
  - access control checks across modules

- **VolumeWeightedOracle.sol**  
  Internal oracle primarily used for dynamic fee calculations
  based on recent trading activity.

---

## 🔐 Security Model

- No hidden minting
- Supply cap enforced on-chain
- Explicit token allowances
- Treasury operations executed via smart contracts
- Vesting enforced by immutable schedules
- Governance actions recorded fully on-chain

Owner permissions are limited to configuration and do not allow arbitrary
token minting or supply manipulation.

---

## 📄 Documentation

The following documents are included directly in this repository:

- **Whitepaper (EN)**  
  `IBITIcoin_whitepaper_EN.pdf`

- **Business Plan (EN)**  
  `IBITI_Business_Plan_v3.0_EN.pdf`

- **Token Schedule & Vesting**  
  `Token Schedule & Vesting.pdf`

---

## ⚙️ Development & Tooling

### Installation

```bash
npm install
Compile contracts
bash
Копировать код
npx hardhat compile
Deploy (example)
bash
Копировать код
npx hardhat run scripts/deploy-mainnet.js --network bsc
Environment
Create a .env file based on .env.example and configure RPC endpoints,
wallets and deployed contract addresses.

🌐 Official Links
Website: https://www.ibiticoin.com

Telegram: https://t.me/IBITIcoin_chat

X (Twitter): https://x.com/ibiticoin

Facebook Group: https://www.facebook.com/groups/ibiticoin

LinkedIn: https://www.linkedin.com/in/ibiticoin

📄 License
This project is released under the MIT License.
See LICENSE.md for details.
