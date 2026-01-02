<p align="center">
  <a href="https://www.ibiticoin.com">
    <img src="img/logo.png" alt="IBITIcoin" width="180" />
  </a>
</p>

<h1 align="center">IBITIcoin Contracts</h1>

<p align="center">
  Smart contracts and deployment tooling for <b>IBITIcoin (IBITI)</b> on <b>BNB Smart Chain (BEP-20)</b>.
</p>

<p align="center">
  <a href="https://www.ibiticoin.com">Website</a> •
  <a href="https://www.ibiticoin.com/whitepaper.html">Whitepaper</a> •
  <a href="https://t.me/IBITIcoin_chat">Telegram</a> •
  <a href="https://x.com/ibiticoin">X</a> •
  <a href="https://www.facebook.com/groups/ibiticoin">Facebook Group</a> •
  <a href="https://www.linkedin.com/in/ibiticoin">LinkedIn</a>
</p>

---

## Overview

This repository contains the Solidity contracts and Hardhat scripts used for IBITIcoin.
It is intended for developers, integrators, and auditors who want to review the code and reproduce builds/deployments.

> ⚠️ Disclaimer: This repository is provided “as is” for transparency and review.
> Nothing here is financial advice. Always do your own research and testing.

---

## Token

- **Name:** IBITIcoin
- **Symbol:** IBITI
- **Standard:** BEP-20
- **Network:** BNB Smart Chain (BSC)
- **Decimals:** 8
- **Max supply:** 100,000,000 IBITI

**Mainnet token address**
- `0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb`

**Primary DEX**
- PancakeSwap (IBITI / USDT)  
  https://pancakeswap.finance/swap?chain=bsc&outputCurrency=0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb&inputCurrency=0x55d398326f99059fF775485246999027B3197955

---

## Repository Structure

- `contracts/` — Solidity smart contracts (core + modules)
- `scripts/` — Hardhat scripts for deployment and verification
- `img/` — brand assets used by README and docs
- `hardhat.config.js` — Hardhat configuration
- `.env.example` — environment variables template
- `IBITIcoin_whitepaper_EN.pdf` — whitepaper (EN)
- `IBITI_Business_Plan_v3.0_EN.pdf` — business plan (EN)
- `Token Schedule & Vesting.pdf` — token schedule / vesting overview

---

## Contracts

Contracts included in `contracts/` (as currently present in this repo):

### Core / Token
- `IBITIcoin.sol` — IBITI BEP-20 token contract
- `BaseToken.sol` — base token utilities / base implementation (project internal)

### Fees / Buyback / Treasury-related Modules
- `FeeManager.sol` — fee configuration/management module (project internal)
- `BuybackManager.sol` — buyback management module (project internal)

### Staking / Sale / Vesting
- `StakingModule.sol` — staking module (project internal)
- `PhasedTokenSale.sol` — phased token sale module (project internal)
- `TeamVesting.sol` — vesting module (project internal)

### Governance / DAO
- `DAOModule.sol` — DAO module interface/base
- `DAOModuleImplementation.sol` — DAO module implementation

### NFTs / Discounts
- `IBITINFT.sol` — NFT contract
- `NFTDiscount.sol` — discount logic linked to NFT usage (project internal)
- `NFTSaleManager.sol` — NFT sale manager (project internal)

### Referral / Promo
- `IBITIReferralPromoRouterCashUUPS.sol` — referral/promo router (UUPS pattern)

### Utilities / Status / Bridge
- `UserStatusManager.sol` — user status registry module (project internal)
- `BridgeManager.sol` — bridge/expansion manager (project internal)

### Oracles / Interfaces / Mocks
- `VolumeWeightedOracle.sol` — oracle utility (project internal)
- `AggregatorV3Interface.sol` — Chainlink aggregator interface
- `IUniswapV2Pair.sol` — UniswapV2 pair interface (also used by PancakeSwap v2 forks)
- `ERC20Mock.sol` — test/mock ERC20

> Notes:
> - “project internal” means the contract is part of the IBITIcoin system (not a third-party library).
> - Interfaces/mocks are included for integration/testing convenience.

---

## Local Development (Hardhat)

### Prerequisites
- Node.js (LTS recommended)
- npm (or yarn)

### Install
```bash
npm install
Compile
bash
Копировать код
npx hardhat compile
Configure Environment
Create .env from .env.example and set your RPC URLs, private keys, and any required addresses.

Never commit your .env.

Deployment & Verification
Scripts included in scripts/:

deploy-mainnet.js — deployment script

verify-mainnet.js — verification script

Example usage:

bash
Копировать код
npx hardhat run scripts/deploy-mainnet.js --network bsc
npx hardhat run scripts/verify-mainnet.js --network bsc
Documentation
Included in repo root:

IBITIcoin_whitepaper_EN.pdf

IBITI_Business_Plan_v3.0_EN.pdf

Token Schedule & Vesting.pdf

Website docs:

https://www.ibiticoin.com/whitepaper.html

Security
Admins will never DM you first.

Always verify links from official sources only.

If you find a potential vulnerability or critical issue, please contact the team via the official website contact channels.

License
MIT License — see LICENSE.md.
-------------------------------------
Official Links
Website: https://www.ibiticoin.com

Whitepaper (EN): https://www.ibiticoin.com/whitepaper.html

Telegram: https://t.me/IBITIcoin_chat

X (Twitter): https://x.com/ibiticoin

Facebook Group: https://www.facebook.com/groups/ibiticoin

LinkedIn: https://www.linkedin.com/in/ibiticoin
