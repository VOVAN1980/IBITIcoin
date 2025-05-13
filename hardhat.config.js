require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("@nomiclabs/hardhat-etherscan");
require("@nomicfoundation/hardhat-chai-matchers");

module.exports = {
  // Боевые контракты в ./contracts, тесты и моки — в ./test
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
    deploy:    "./deploy"
  },
  // Игнорируем любые solidity-файлы в contracts/test — тесты лежат в ./test
  ignorePaths: ["contracts/test/**/*"],

  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      metadata:  { bytecodeHash: "none"  },
      viaIR:     true,
    },
  },

  contractSizer: {
    alphaSort:         true,
    runOnCompile:      false,
    disambiguatePaths: false,
  },

  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    bscTestnet: {
      url:      process.env.BSC_RPC_URL,
      chainId:  97,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.trim()] : [],
      gasPrice: 1_000_000_000,
    },
    localhost: {
      url: "http://127.0.0.1:8545/",
    },
  },

  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || "",
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency:   "USD",
    gasPrice:   21,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
  },

  mocha: {
    timeout: 200000,
  },
};
