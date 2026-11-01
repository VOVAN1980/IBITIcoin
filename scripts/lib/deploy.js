// Деплой: сначала вестинг, затем токен, который сразу раздаёт весь выпуск.
//
// Вестингу нужен адрес токена, а токену — адрес вестинга. Адрес контракта определяется адресом
// кошелька и номером транзакции (nonce), поэтому адрес токена известен заранее: токен уходит с
// заранее заданным nonce и либо появится именно по этому адресу, либо не появится вообще.
//
// Журнал пишется до ожидания подтверждения, поэтому прерванный деплой можно продолжить.
const fs = require("fs");
const path = require("path");
const { ethers: E } = require("ethers");

function readJournal(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

async function newJournal({ ethers, me, plan, network, chainId }) {
  const provider = ethers.provider;
  const nonce = await provider.getTransactionCount(me, "pending");
  const vestingAddress = E.getCreateAddress({ from: me, nonce });
  const tokenAddress = E.getCreateAddress({ from: me, nonce: nonce + 1 });

  const start = plan.vesting.start ?? (await provider.getBlock("latest")).timestamp;
  const entries = plan.distribution.map((a) => ({
    role: a.role,
    label: a.label,
    to: a.role === "vesting" ? vestingAddress : a.to,
    amount: a.amount.toString(),
  }));

  return {
    network,
    chainId: Number(chainId),
    deployer: me,
    status: "incomplete",
    distribution: entries,
    vesting: {
      nonce,
      address: vestingAddress,
      args: [tokenAddress, plan.vesting.owner, plan.vesting.amount.toString(), start],
      tx: null,
    },
    token: {
      nonce: nonce + 1,
      address: tokenAddress,
      args: [entries.map((x) => x.to), entries.map((x) => x.amount)],
      tx: null,
    },
  };
}

async function deployStep({ ethers, signer, me, name, item, save }) {
  const provider = ethers.provider;

  if (item.tx) {
    const tx = await provider.getTransaction(item.tx);
    if (!tx) throw new Error(`${name}: транзакция ${item.tx} не найдена в сети. Проверьте её на BscScan.`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error(`${name}: транзакция ${item.tx} не прошла`);
    return;
  }
  // Сбой мог случиться сразу после отправки, до записи в журнал: контракт уже стоит по этому адресу.
  if ((await provider.getCode(item.address)) !== "0x") return;

  const current = await provider.getTransactionCount(me, "pending");
  if (current !== item.nonce) {
    throw new Error(
      `${name}: у кошелька ${me} номер транзакции ${current}, а нужен ${item.nonce}: он отправлял другие транзакции. ` +
        "Токен не выпущен, потерь нет. Переименуйте журнал и запустите деплой заново."
    );
  }

  const factory = await ethers.getContractFactory(name, signer);
  const contract = await factory.deploy(...item.args, { nonce: item.nonce });
  item.tx = contract.deploymentTransaction().hash;
  save();

  await contract.waitForDeployment();
  const actual = await contract.getAddress();
  if (actual !== item.address) throw new Error(`${name}: адрес ${actual}, а ожидался ${item.address}`);
}

// onStep нужен для проверки прерывания в тестах.
async function runDeploy({ ethers, signer, plan, journalPath, network, chainId, onStep = async () => {} }) {
  const me = await signer.getAddress();
  let journal = readJournal(journalPath);

  if (journal?.status === "complete") throw new Error(`Уже есть ${journalPath}: деплой завершён. Второй поверх не делаем.`);
  if (journal && (journal.deployer !== me || journal.chainId !== Number(chainId))) {
    throw new Error(`Журнал ${journalPath} начат другим кошельком или в другой сети`);
  }
  if (!journal) journal = await newJournal({ ethers, me, plan, network, chainId });

  const save = () => {
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  };
  save();

  await deployStep({ ethers, signer, me, name: "IBITIVesting", item: journal.vesting, save });
  await onStep("vesting");
  await deployStep({ ethers, signer, me, name: "IBITI", item: journal.token, save });

  journal.status = "complete";
  save();
  return journal;
}

module.exports = { runDeploy, readJournal };
