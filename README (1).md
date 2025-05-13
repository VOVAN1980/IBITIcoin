# 🚀 IBITIcoin Project

IBITIcoin is a decentralized ecosystem built on BNB Smart Chain, combining a native token ($IBITI), NFT infrastructure, DAO governance, buyback mechanisms, and staking — all modular and verified.

---

## 🧩 Modules Included

| Module             | Description |
|--------------------|-------------|
| `IBITIcoin.sol`    | Native token with BNB/USDT purchase support, dynamic fees, and integrations |
| `IBITINFT.sol`     | NFT with mint limits, categories, and integrations |
| `FeeManager.sol`   | Handles dynamic fees with NFT-based discounts |
| `NFTDiscount.sol`  | NFT categories for VIP/Staking/Jackpot |
| `NFTSaleManager.sol` | NFT purchasing system using USDT or IBITI |
| `BuybackManager.sol` | Buyback tokens from liquidity pool and burn |
| `TeamVesting.sol`  | Team token vesting with monthly unlock |
| `DAOModule.sol`    | Governance with proposal voting and NFT rewards |
| `StakingModule.sol` | Stake IBITI to earn yield and NFT bonuses |

---

## 📄 Contracts (Testnet)

| Name | Address |
|------|---------|
| IBITIcoin | `0xE74bc1a98b00Dd283aa9DaDFa3c00CB19e532961` |
| IBITINFT | `0x3493B34cC27847234c3C424809f27f369DDc5D91` |
| FeeManager | `0x5B3ec05C4F4505EB0d4b2c35fe772bD74Fa13721` |
| NFTDiscount | `0x1a49D38feE9BdDEF99b8478419b8b3ac645c403d` |
| NFTSaleManager | `0xa87a1951806FC1eFAf85Cf8688AB82Dd990e08a1` |
| BuybackManager | `0x5Cf4DA7d8d8FF0c9d8954A3CdBF1eB3F41C85591` |
| TeamVesting | `0x98D43B4A4A89eb8B02B4aB54D87183aFd53d7F9C` |
| StakingModule | `0xf1d6963793155385c258Fd88Ee44F87F26E3931a` |
| DAOModuleImpl | `0x5A468372E196Ae7E822Ea224E6caEF9A22EF8b10` |
| VW Oracle | `0x863CeD02c86CB6fC1d0b7162929127d4C3b45303` |

---
## 🧪 Run Tests
Из-за ограничения на размер, все тесты находятся в архиве:

📦 `Архив ZIP - WinRAR.zip`

➤ Распакуйте вручную в корень проекта, чтобы использовать:

```bash
unzip "Архив ZIP - WinRAR.zip"
npx hardhat test

📂 Тесты находятся в архиве: [test.zip](./Архив%20ZIP%20-%20WinRAR.zip)

### 🔎 Coverage

- ✅ 96%+ lines tested
- ✅ 1000+ passing tests

---

## 🚀 Deployment

```bash
npx hardhat run scripts/deploy-testnet.js --network bscTestnet
```

## ✅ Verification

```bash
npx hardhat run scripts/verify-testnet.js --network bscTestnet
```

## 🔐 Utility Scripts

```bash
npx hardhat run scripts/disable-fee.js --network bscTestnet <userAddress>
```

---

## 🌐 Environment Variables

`.env.example` contains all required values:

```
PRIVATE_KEY=...
BSC_RPC_URL=...
BSCSCAN_API_KEY=...
WALLET_ADDRESS=...
...
```

---

## 📜 License

MIT © IBITIcoin 2025
