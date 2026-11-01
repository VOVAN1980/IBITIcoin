// Какой кошелёк подписывает. В mainnet только заданный адрес Ledger, а не «первый в списке».
const MAINNET_NETWORKS = ["bsc", "bscLiquidity", "bscReserve"];

async function getSigner({ ethers, network }) {
  const { chainId } = await ethers.provider.getNetwork();
  if (network.config.chainId && BigInt(network.config.chainId) !== chainId) {
    throw new Error(`RPC отвечает chainId ${chainId}, а сеть ${network.name} — это ${network.config.chainId}`);
  }

  const ledger = network.config.ledgerAccounts || [];
  if (MAINNET_NETWORKS.includes(network.name) && ledger.length !== 1) {
    throw new Error(`Для ${network.name} в .env должен быть задан ровно один адрес Ledger`);
  }
  if (ledger.length === 0) return (await ethers.getSigners())[0];

  const signer = await ethers.getSigner(ledger[0]);
  const actual = await signer.getAddress();
  if (actual.toLowerCase() !== ledger[0].toLowerCase()) {
    throw new Error(`Подписывает ${actual}, а ожидался Ledger ${ledger[0]}`);
  }
  return signer;
}

module.exports = { getSigner };
