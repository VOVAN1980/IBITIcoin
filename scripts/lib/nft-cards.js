// Карточки коллекции. Тираж и цена в USDT задаются перед настройкой: тираж потом можно только снизить, цену — менять.
// Полная коллекция с книгой добавляется отдельной карточкой, когда будет цена.
const BASE = "https://www.ibiticoin.com/nft/metadata/";

const NAMES = [
  "Creation",
  "Awakening",
  "The First Gods and Kings",
  "Enlightenment",
  "The Age of Darkness and Faith",
  "Blood and Steel",
  "Digital Cell",
  "The Last Frontier",
  "Quantum Leap",
  "End or Rebirth",
  "Pandora",
];

const MAX_SUPPLY = [1000, 500, 300, 200, 100, 50, 25, 15, 10, 5, 1];
const PRICE_USDT = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 50000];

const cards = NAMES.map((name, i) => ({
  id: i + 1,
  name,
  uri: `${BASE}${i + 1}.json`,
  maxSupply: MAX_SUPPLY[i],
  price: PRICE_USDT[i],
}));

module.exports = { cards };
