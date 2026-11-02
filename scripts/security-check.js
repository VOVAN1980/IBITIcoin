// Проверка настоящей сети: только чтение, ничего не подписывает и не отправляет.
// Кто владеет контрактами, кому выданы права, какие разрешения открыты, куда двигались токены с начала.
//   node scripts/security-check.js
require("dotenv").config();
const { ethers } = require("ethers");
const main = require("../deployments/bsc.json");
const promoJ = require("../deployments/bsc.promo-sale.json");
const stakingJ = require("../deployments/bsc.staking.json");
const nftJ = require("../deployments/bsc.nft.json");

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const LEDGERS = {
  "0xC00dC8E3F4647AAa4791AE58901eDDFE6095adA5": "Ledger Казна",
  "0x9d8dd8B2CFF7A17967fA0eF19eD5C0b3EBeFDe41": "Ledger Основной",
  "0x1841DE9b1c8bF5244675896b0F4FF96C9331596f": "Ledger Вестинг",
};
const CONTRACTS = {
  [main.vesting.address]: "вестинг",
  [promoJ.address]: "продажа IBITI",
  [stakingJ.address]: "стейкинг",
  [nftJ.collection.address]: "коллекция NFT",
  [nftJ.sale.address]: "продажа NFT",
};
const name = (a) => LEDGERS[ethers.getAddress(a)] || CONTRACTS[ethers.getAddress(a)] || (a === ethers.ZeroAddress ? "выпуск" : a);
const OWNABLE = ["function owner() view returns (address)", "function pendingOwner() view returns (address)"];
const WINDOW = 5_000_000;

async function logs(p, address, topics, fromBlock, toBlock) {
  const out = [];
  for (let b = fromBlock; b <= toBlock; b += WINDOW) {
    out.push(...(await p.getLogs({ address, topics, fromBlock: b, toBlock: Math.min(b + WINDOW - 1, toBlock) })));
  }
  return out;
}

async function run() {
  const url = process.env.BSC_ARCHIVE_RPC_URL || process.env.BSC_MAINNET_RPC_URL;
  if (!url) throw new Error("В .env нет RPC основной сети");
  const p = new ethers.JsonRpcProvider(url);
  const latest = await p.getBlockNumber();
  const problems = [];

  const startTx = stakingJ.tx;
  const stakingBlock = (await p.getTransactionReceipt(startTx)).blockNumber;
  // Токен выпущен раньше стейкинга: ищем с запасом в 200 000 блоков
  const from = stakingBlock - 200_000;
  console.log(`Блок ${latest}. Журналы с блока ${from}.\n`);

  console.log("Владельцы:");
  for (const [address, label] of Object.entries(CONTRACTS)) {
    const c = new ethers.Contract(address, OWNABLE, p);
    const owner = await c.owner();
    const pending = await c.pendingOwner();
    console.log(`  ${label}: ${name(owner)}${pending === ethers.ZeroAddress ? "" : `, ОЖИДАЕТ ПЕРЕДАЧИ: ${pending}`}`);
    if (!LEDGERS[owner]) problems.push(`${label}: владелец не Ledger`);
    if (pending !== ethers.ZeroAddress) problems.push(`${label}: начата передача владения`);
    const moved = await logs(p, address, [ethers.id("OwnershipTransferred(address,address)")], from, latest);
    if (moved.length > 1) console.log(`    смен владельца: ${moved.length - 1}`);
  }

  console.log("\nВыданные права за всю историю:");
  const seller = await new ethers.Contract(nftJ.collection.address, ["function seller() view returns (address)"], p).seller();
  console.log(`  коллекция, единственный выпускающий: ${name(seller)}`);
  if (seller !== nftJ.sale.address) problems.push(`коллекция: выпускает не наша продажа, а ${seller}`);
  const saleCollection = await new ethers.Contract(nftJ.sale.address, ["function collection() view returns (address)"], p).collection();
  if (saleCollection !== nftJ.collection.address) problems.push(`продажа работает с другой коллекцией: ${saleCollection}`);
  // Контракты не обновляются: слот реализации ERC-1967 у них должен быть пуст
  const SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  for (const [address, label] of Object.entries(CONTRACTS)) {
    if ((await p.getStorage(address, SLOT)) !== ethers.ZeroHash) problems.push(`${label}: найден адрес реализации, контракт обновляемый`);
  }
  const members = await logs(p, main.vesting.address, [ethers.id("MemberAdded(address)")], from, latest);
  console.log(`  вестинг, участников команды добавлено: ${members.length}`);
  const released = await logs(p, main.vesting.address, [ethers.id("Released(address,uint256)")], from, latest);
  console.log(`  вестинг, выдач: ${released.length}`);

  console.log("\nРазрешения IBITI, выданные кем-либо (все события Approval):");
  const erc = new ethers.Interface(["event Approval(address indexed owner, address indexed spender, uint256 value)", "event Transfer(address indexed from, address indexed to, uint256 value)"]);
  const token = new ethers.Contract(main.token.address, ["function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"], p);
  const approvals = await logs(p, main.token.address, [erc.getEvent("Approval").topicHash], from, latest);
  const pairs = new Set(approvals.map((x) => {
    const a = erc.parseLog(x).args;
    return `${a.owner}|${a.spender}`;
  }));
  let open = 0;
  for (const pair of pairs) {
    const [owner, spender] = pair.split("|");
    const left = await token.allowance(owner, spender);
    if (left !== 0n) {
      open++;
      console.log(`  ОТКРЫТО: ${name(owner)} → ${name(spender)}: ${ethers.formatUnits(left, 8)} IBITI`);
      if (LEDGERS[owner]) problems.push(`открытое разрешение IBITI с ${name(owner)}`);
    }
  }
  console.log(`  пар за всю историю ${pairs.size}, открыто сейчас ${open}`);

  console.log("\nРазрешения USDT с Ledger на контракты проекта и роутер:");
  const usdt = new ethers.Contract(USDT, ["function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"], p);
  for (const ledger of Object.keys(LEDGERS)) {
    for (const spender of [...Object.keys(CONTRACTS), ROUTER, main.token.address]) {
      const left = await usdt.allowance(ledger, spender);
      if (left !== 0n) {
        console.log(`  ОТКРЫТО: ${name(ledger)} → ${name(spender)}: ${ethers.formatEther(left)} USDT`);
        problems.push(`открытое разрешение USDT с ${name(ledger)}`);
      }
    }
  }
  const usdtApprovals = [];
  for (const ledger of Object.keys(LEDGERS)) {
    usdtApprovals.push(...(await logs(p, USDT, [erc.getEvent("Approval").topicHash, ethers.zeroPadValue(ledger, 32)], from, latest)));
  }
  for (const x of usdtApprovals) {
    const a = erc.parseLog(x).args;
    const left = await usdt.allowance(a.owner, a.spender);
    console.log(`  событие: ${name(a.owner)} → ${name(a.spender)}, сейчас ${ethers.formatEther(left)} USDT`);
    if (left !== 0n) problems.push(`открытое разрешение USDT с ${name(a.owner)} на ${a.spender}`);
  }
  console.log(`  событий с начала V2: ${usdtApprovals.length}`);

  console.log("\nВсе движения IBITI с выпуска:");
  const transfers = await logs(p, main.token.address, [erc.getEvent("Transfer").topicHash], from, latest);
  for (const x of transfers) {
    const a = erc.parseLog(x).args;
    console.log(`  ${name(a.from)} → ${name(a.to)}: ${ethers.formatUnits(a.value, 8)} IBITI`);
  }

  console.log("\nБалансы:");
  for (const address of [...Object.keys(LEDGERS), ...Object.keys(CONTRACTS)]) {
    const bal = await token.balanceOf(address);
    console.log(`  ${name(address)}: ${ethers.formatUnits(bal, 8)} IBITI, ${ethers.formatEther(await usdt.balanceOf(address))} USDT, ${ethers.formatEther(await p.getBalance(address))} BNB`);
  }
  console.log(`  Весь выпуск: ${ethers.formatUnits(await token.totalSupply(), 8)} IBITI`);

  for (const [address, label] of Object.entries(CONTRACTS)) {
    if ((await usdt.balanceOf(address)) !== 0n) problems.push(`на контракте ${label} лежат USDT`);
  }

  console.log(problems.length ? `\n✖ Проблемы:\n  - ${problems.join("\n  - ")}` : "\n✔ Посторонних владельцев, прав и открытых разрешений с Ledger нет");
  if (problems.length) process.exitCode = 1;
}

run().catch((e) => {
  // Адрес узла содержит ключ и в вывод не попадает
  console.error(`✖ ${e.code || "ошибка"}: ${e.shortMessage || "запрос к сети не прошёл"}`);
  process.exitCode = 1;
});
