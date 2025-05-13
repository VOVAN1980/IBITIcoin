// IBITI Core - Глобальная конфигурация экосистемы IBITI
// Поддержка AI-управления, токеномики, голосований, безопасности и мультичейна

module.exports = {
  blockchain: {
    network: "IBITI-Mainnet",
    rpcUrl: "https://rpc.isiblockchain.io",
    chainId: 12345,
    multiChainSupport: ["Ethereum", "BSC", "Polygon", "Solana"],
  },
  staking: {
    minimumStake: 100,
    rewardPercentage: 5,
    autoCompounding: true,
    nftBoostEnabled: true,
  },
  governance: {
    proposalThreshold: 500,
    votingDuration: 72,
    quorumPercentage: 50,
  },
  treasury: {
    autoBuyback: true,
    investmentPools: ["DeFi", "Yield Farming", "Liquidity Mining"],
  },
  security: {
    antiWhaleLimit: 1, // 1% от total supply
    frontRunningProtection: true,
    transactionRateLimit: 10,
  },
};
