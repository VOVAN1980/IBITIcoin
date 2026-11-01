require("dotenv").config();

require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ledger");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");

const {
  BSC_MAINNET_RPC_URL,
  BSC_RPC_URL, // это testnet
  DEPLOYER_LEDGER,
  LIQUIDITY_LEDGER,
  TESTNET_LEDGER,
  RESERVE_WALLET,
  PRIVATE_KEY, // только testnet
  ETHERSCAN_V2_KEY,
  FORK_RPC_URL,
  FORK_BLOCK,
} = process.env;

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.22",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },

  networks: {
    // Обычные тесты — чистая локальная сеть. Форк BSC только если задан FORK_RPC_URL.
    // Без архивного RPC укажите FORK_BLOCK = свежий номер блока: обычные узлы старое состояние не хранят.
    // hardhat node подставляет газ = лимиту блока; по умолчанию это 30M,
    // а лимит одной транзакции (EIP-7825) — 16 777 216. Только для локальной ноды.
    hardhat: {
      blockGasLimit: 16_777_216,
      ...(FORK_RPC_URL
        ? { forking: { url: FORK_RPC_URL, ...(FORK_BLOCK ? { blockNumber: Number(FORK_BLOCK) } : {}) } }
        : {}),
    },

    // Testnet: одноразовый ключ, если задан, иначе тот же Ledger
    bscTestnet: {
      url: BSC_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      ...(PRIVATE_KEY
        ? { accounts: [PRIVATE_KEY] }
        : { ledgerAccounts: TESTNET_LEDGER || DEPLOYER_LEDGER ? [TESTNET_LEDGER || DEPLOYER_LEDGER] : [] }),
    },

    // Mainnet: подпись только на Ledger
    bsc: {
      url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      ledgerAccounts: DEPLOYER_LEDGER ? [DEPLOYER_LEDGER] : [],
    },

    // Mainnet, Ledger Основной: запас и управление контрактом сайта
    bscReserve: {
      url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      ledgerAccounts: RESERVE_WALLET ? [RESERVE_WALLET] : [],
    },

    // Mainnet, кошелёк ликвидности: только scripts/04-add-liquidity.js
    bscLiquidity: {
      url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      ledgerAccounts: LIQUIDITY_LEDGER ? [LIQUIDITY_LEDGER] : [],
    },
  },

  // Etherscan API v2: один ключ на все сети
  etherscan: { apiKey: ETHERSCAN_V2_KEY },

  mocha: { timeout: 300000 },
};
