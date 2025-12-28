require("dotenv").config();

require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ledger");
require("@nomicfoundation/hardhat-verify");

require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("solidity-coverage");

const {
  BSC_ARCHIVE_RPC_URL,
  BSC_RPC_URL,
  BSC_MAINNET_RPC_URL,
  PRIVATE_KEY,
  FOUNDER_WALLET,
  RESERVE_WALLET,
  BSC_MAINNET_GAS_PRICE,
  ETHERSCAN_V2_KEY,          // ← новый ключ API V2
} = process.env;

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  defaultNetwork: "hardhat",

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      metadata: { bytecodeHash: "none" },
      viaIR: true,
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "storageLayout",
          ],
        },
      },
    },
  },

  // ──────────────────────────────────────────
  //                 NETWORKS
  // ──────────────────────────────────────────

  networks: {
    hardhat: {
      chainId: 56,
      allowUnlimitedContractSize: true,
      forking: {
        url: BSC_ARCHIVE_RPC_URL || "",
      },
    },

    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Testnet через PRIVATE_KEY
    bscTestnet: {
      url: BSC_RPC_URL || "",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 1_000_000_000,
    },

    // Mainnet через Ledger (FOUNDER)
bsc: {
  url: BSC_MAINNET_RPC_URL || "",
  chainId: 56,
  ledgerAccounts: FOUNDER_WALLET ? [FOUNDER_WALLET] : [],
  gasPrice: BSC_MAINNET_GAS_PRICE
    ? parseInt(BSC_MAINNET_GAS_PRICE, 10)
    : 5_000_000_000,
},

// Mainnet через Ledger (RESERVE)  ✅ ДЛЯ ЛИКВИДНОСТИ
bscReserve: {
  url: BSC_MAINNET_RPC_URL || "",
  chainId: 56,
  ledgerAccounts: RESERVE_WALLET ? [RESERVE_WALLET] : [],
  gasPrice: BSC_MAINNET_GAS_PRICE
    ? parseInt(BSC_MAINNET_GAS_PRICE, 10)
    : 5_000_000_000,
   },
  },

  // ──────────────────────────────────────────
  //            ETHERSCAN API V2
  // ──────────────────────────────────────────
  etherscan: {
    apiKey: ETHERSCAN_V2_KEY,   // <-- новый единый ключ
    customChains: [
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    gasPrice: 21,
  },

  mocha: {
    timeout: 200000,
  },
};
