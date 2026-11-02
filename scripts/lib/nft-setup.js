// Шаги настройки коллекции и закрытия старых контрактов. Выполненные шаги пропускаются, поэтому прерванный запуск можно повторить.
// Проверки идут до первой подписи: продажа, цены и перенос запаса необратимы, ошибочный адрес потом не исправить.
const { ethers, artifacts } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 18);

// Тот ли код по адресу, что собран из наших исходников. Хвост с хэшем исходников не сравнивается.
// Значения, вписанные при создании, зависят от деплоя: со сборкой их не сравнить, но все копии одного значения обязаны совпадать.
// Иначе подделка покажет настоящий адрес через геттер, а платить будет на другой. Само значение сверяет вызывающий через геттер.
async function matchesBuild(name, address) {
  const build = await artifacts.getBuildInfo(`contracts/${name}.sol:${name}`);
  const out = build.output.contracts[`contracts/${name}.sol`][name].evm.deployedBytecode;
  const strip = (hex) => hex.slice(0, -(parseInt(hex.slice(-4), 16) * 2 + 4));
  const local = strip(out.object).split("");
  const chain = strip((await ethers.provider.getCode(address)).slice(2)).split("");
  if (local.length !== chain.length) return false;
  for (const refs of Object.values(out.immutableReferences || {})) {
    let first;
    for (const r of refs) {
      const value = chain.slice(r.start * 2, (r.start + r.length) * 2).join("");
      if (first !== undefined && value !== first) return false;
      first = value;
      for (let i = r.start * 2; i < (r.start + r.length) * 2; i++) {
        local[i] = "0";
        chain[i] = "0";
      }
    }
  }
  return local.join("") === chain.join("");
}

// Что мешает настройке. Проверяется перед планом при каждом запуске, в том числе когда шагов не осталось.
async function setupProblems({ nft, sale, list, owner, usdt, reserve }) {
  const collectionAddress = await nft.getAddress();
  const saleAddress = await sale.getAddress();
  const problems = [];
  if (!(await matchesBuild("IBITICollection", collectionAddress))) problems.push(`по адресу коллекции ${collectionAddress} не тот код`);
  if (!(await matchesBuild("IBITINFTSale", saleAddress))) problems.push(`по адресу продажи ${saleAddress} не тот код`);
  if (problems.length) return problems;

  const saleCollection = await sale.collection();
  if (saleCollection !== collectionAddress) problems.push(`продажа работает с другой коллекцией: ${saleCollection}`);
  const paymentToken = await sale.paymentToken();
  if (paymentToken !== ethers.getAddress(usdt)) problems.push(`продажа берёт не тот USDT: ${paymentToken}`);
  const wallet = await sale.reserveWallet();
  if (wallet !== ethers.getAddress(reserve)) problems.push(`USDT идут не на тот кошелёк: ${wallet}`);
  const expectedOwner = ethers.getAddress(owner);
  if ((await nft.owner()) !== expectedOwner) problems.push(`владелец коллекции ${await nft.owner()}, а нужен ${expectedOwner}`);
  if ((await sale.owner()) !== expectedOwner) problems.push(`владелец продажи ${await sale.owner()}, а нужен ${expectedOwner}`);

  const seller = await nft.seller();
  if (seller !== ethers.ZeroAddress && seller !== saleAddress) problems.push(`коллекция уже закреплена за другой продажей: ${seller}`);
  if (seller === ethers.ZeroAddress && !(await sale.paused())) problems.push("до настройки продажа должна быть на паузе");

  const count = Number(await nft.cardCount());
  if (count !== 0 && count !== list.length) problems.push(`в коллекции уже ${count} карточек вместо ${list.length}`);
  if (count === list.length) {
    for (const c of list) {
      const [, maxSupply] = await nft.supplyOf(c.id);
      if (maxSupply !== BigInt(c.maxSupply)) problems.push(`неверный тираж карточки ${c.id}: ${maxSupply}`);
    }
  }
  const current = await Promise.all(list.map((c) => sale.priceOf(c.id)));
  const differ = list.filter((c, i) => current[i] !== 0n && current[i] !== U(c.price)).map((c) => c.id);
  if (differ.length) problems.push(`цена уже задана и не меняется, карточки: ${differ.join(", ")}`);
  return problems;
}

// Шаг: [название, функция, которая отправляет транзакцию]
async function setupSteps({ nft, sale, list, owner, usdt, reserve }) {
  const problems = await setupProblems({ nft, sale, list, owner, usdt, reserve });
  if (problems.length) throw new Error(`не настраиваю:\n  - ${problems.join("\n  - ")}`);

  const saleAddress = await sale.getAddress();
  const steps = [];

  if ((await nft.cardCount()) === 0n) {
    steps.push(["Добавить карточки", () => nft.addCards(list.map((c) => c.uri), list.map((c) => c.maxSupply))]);
  }

  if ((await nft.seller()) === ethers.ZeroAddress) {
    steps.push(["Назначить контракт продажи: только он выпускает карточки (один раз и навсегда)", () => nft.setSeller(saleAddress)]);
  }

  const ids = list.map((c) => c.id);
  const prices = list.map((c) => U(c.price));
  const current = await Promise.all(ids.map((id) => sale.priceOf(id)));
  const unset = ids.flatMap((id, i) => (current[i] === 0n ? [i] : []));
  if (unset.length) steps.push(["Цены карточек (один раз и навсегда)", () => sale.setPrices(unset.map((i) => ids[i]), unset.map((i) => prices[i]))]);

  // Продажа открывается только вместе с незавершённой настройкой: намеренную паузу повторный запуск не снимает
  if (steps.length && (await sale.paused())) steps.push(["Открыть продажу карточек", () => sale.unpause()]);
  return steps;
}

// Всё ли настроено, как задумано. Возвращает список расхождений.
async function checkSetup({ nft, sale, list }) {
  const problems = [];
  const [catPrices, , catMax] = await sale.catalog();
  if (catPrices.length !== list.length) problems.push(`карточек ${catPrices.length} вместо ${list.length}`);
  list.forEach((c, i) => {
    if (catPrices[i] !== U(c.price)) problems.push(`неверная цена карточки ${c.id}`);
    if (catMax[i] !== BigInt(c.maxSupply)) problems.push(`неверный тираж карточки ${c.id}`);
  });
  if ((await nft.seller()) !== (await sale.getAddress())) problems.push("контракт продажи не назначен");
  if ((await sale.collection()) !== (await nft.getAddress())) problems.push("продажа работает с другой коллекцией");
  return problems;
}

// Подходит ли адрес как новый стейкинг: запас наград уходит туда насовсем.
async function receiverProblems({ oldStaking, newStakingAddress, owner }) {
  if (newStakingAddress === (await oldStaking.getAddress())) return ["новый стейкинг совпадает со старым"];
  if (!(await matchesBuild("IBITIStaking", newStakingAddress))) return [`по адресу ${newStakingAddress} не новый стейкинг`];

  const receiver = await ethers.getContractAt("IBITIStaking", newStakingAddress);
  const problems = [];
  const token = await oldStaking.token();
  if ((await receiver.token()) !== token) problems.push(`новый стейкинг работает с другим токеном: ${await receiver.token()}`);
  const expectedOwner = ethers.getAddress(owner);
  if ((await receiver.owner()) !== expectedOwner) problems.push(`владелец нового стейкинга ${await receiver.owner()}, а нужен ${expectedOwner}`);
  if (!(await receiver.paused())) problems.push("новый стейкинг должен быть на паузе до переноса запаса");
  if ((await receiver.totalStaked()) !== 0n || (await receiver.reservedRewards()) !== 0n) problems.push("на новом стейкинге уже есть вклады");
  return problems;
}

// Открытые обязательства старых контрактов. Закрытые вклады сюда не попадают: их штрафы уже стали свободным запасом.
async function oldInUse({ oldStaking, oldNft }) {
  const inUse = [];
  const staked = await oldStaking.totalStaked();
  if (staked !== 0n || (await oldStaking.reservedRewards()) !== 0n) inUse.push(`на старом стейкинге есть вклады: ${ethers.formatUnits(staked, 8)} IBITI`);
  if (oldNft) {
    const minted = await oldNft.lastTokenId();
    if (minted !== 0n) inUse.push(`в старой коллекции уже выпущено NFT: ${minted}`);
  }
  return inUse;
}

// Закрытие старых стейкинга и продажи. Пауза ставится всегда: чужая покупка не должна её задержать.
// Запас наград переносится, только когда у старых контрактов нет открытых обязательств: иначе решает человек.
// Неверный получатель останавливает всё до первой транзакции. Перед переводом всё читается заново.
async function closeOldSteps({ oldStaking, oldSale, oldNft, newStakingAddress, owner }) {
  const free = newStakingAddress ? await oldStaking.freeRewards() : 0n;
  if (free > 0n) {
    const problems = await receiverProblems({ oldStaking, newStakingAddress, owner });
    if (problems.length) throw new Error(`запас не переношу:\n  - ${problems.join("\n  - ")}`);
  }

  const steps = [];
  const inUse = await oldInUse({ oldStaking, oldNft });
  if (!(await oldStaking.paused())) steps.push(["Пауза старого стейкинга", () => oldStaking.pause()]);
  if (!(await oldSale.paused())) steps.push(["Пауза старой продажи карточек", () => oldSale.pause()]);
  if (free > 0n && !inUse.length) {
    steps.push([`Перенести запас наград на новый стейкинг: ${ethers.formatUnits(free, 8)} IBITI`, async () => {
      const now = [...(await oldInUse({ oldStaking, oldNft })), ...(await receiverProblems({ oldStaking, newStakingAddress, owner }))];
      if (now.length) throw new Error(`запас не переношу:\n  - ${now.join("\n  - ")}`);
      return oldStaking.withdrawFreeRewards(newStakingAddress, await oldStaking.freeRewards());
    }]);
  }
  return { steps, inUse };
}

module.exports = { setupSteps, checkSetup, closeOldSteps, matchesBuild };
