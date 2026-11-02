// Карточки коллекции. Цена задаётся один раз и больше не меняется, тираж потом можно только снизить.
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

const MAX_SUPPLY = [2000, 1000, 500, 300, 100, 50, 25, 15, 10, 5, 1];
const PRICE_USDT = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 100000];

const cards = NAMES.map((name, i) => ({
  id: i + 1,
  name,
  uri: `${BASE}${i + 1}.json`,
  maxSupply: MAX_SUPPLY[i],
  price: PRICE_USDT[i],
}));

module.exports = { cards };
