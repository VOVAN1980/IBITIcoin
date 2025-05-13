require("dotenv").config();

module.exports = {
  blockchain: {
    network: process.env.BLOCKCHAIN_NETWORK || "IBITI-Mainnet",
    rpcUrl: process.env.BSC_RPC_URL || "https://rpc.isiblockchain.io",
    chainId: process.env.CHAIN_ID || 12345,
    multiChainSupport: ["Ethereum", "BSC", "Polygon", "Solana"]
  },
  staking: {
    minimumStake: 100,
    rewardPercentage: 5,
    autoCompounding: true,
    unstakeCooldown: 7,
    nftBoostEnabled: true
  },
  governance: {
    proposalThreshold: 500,
    votingDuration: 72,
    quorumPercentage: 50,
    smartVoting: true
  },
  fees: {
    transactionFee: 0.001,
    stakingFee: 0.005,
    votingFee: 0.002,
    crossChainFee: 0.003
  },
  security: {
    maxTransactionsPerMinute: 10,
    penaltyForAbuse: 20,
    antiWhaleLimit: 1,
    frontRunningProtection: true
  },
  treasury: {
    autoBuyback: true,
    investmentPools: ["DeFi", "Yield Farming", "Liquidity Mining"]
  }
};
