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
  ETHERSCAN_V2_KEY,
} = process.env;

// -------- helpers --------
function normalizePk(pkRaw) {
  const v = (pkRaw || "").trim();
  if (!v) return "";
  const with0x = v.startsWith("0x") ? v : `0x${v}`;
  // 32 bytes hex => 66 chars with 0x
  return with0x.length === 66 ? with0x : "";
}

const testnetPk = normalizePk(PRIVATE_KEY);
const testnetAccounts = testnetPk ? [testnetPk] : [];

const mainnetGasPrice = BSC_MAINNET_GAS_PRICE
  ? parseInt(BSC_MAINNET_GAS_PRICE, 10)
  : 5_000_000_000;

// Чтобы hardhat-forking не падал, если URL пустой
const hardhatNetwork = {
  chainId: 56,
  allowUnlimitedContractSize: true,
  ...(BSC_ARCHIVE_RPC_URL ? { forking: { url: BSC_ARCHIVE_RPC_URL } } : {}),
};

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
  hardhat: hardhatNetwork,

  localhost: { url: "http://127.0.0.1:8545" },

  bscTestnet: {
    url: BSC_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
    chainId: 97,
    accounts: testnetAccounts,
    gasPrice: 1_000_000_000,
  },

  // Founder
  bsc: {
    url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org/",
    chainId: 56,
    ledgerAccounts: FOUNDER_WALLET ? [FOUNDER_WALLET] : [],
    gasPrice: mainnetGasPrice,
  },

  // 🔥 Новый алиас (то же самое что bsc)
  bscOwner: {
    url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org/",
    chainId: 56,
    ledgerAccounts: FOUNDER_WALLET ? [FOUNDER_WALLET] : [],
    gasPrice: mainnetGasPrice,
  },

  // Reserve
  bscReserve: {
    url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org/",
    chainId: 56,
    ledgerAccounts: RESERVE_WALLET ? [RESERVE_WALLET] : [],
    gasPrice: mainnetGasPrice,
  },
},

  // ──────────────────────────────────────────
  //            ETHERSCAN API V2
  // ──────────────────────────────────────────
  etherscan: {
    apiKey: ETHERSCAN_V2_KEY || "",
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
