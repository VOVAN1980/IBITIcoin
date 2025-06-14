# 🚀 IBITIcoin

![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://img.shields.io/badge/tests-100%25-success)
![Network](https://img.shields.io/badge/network-BSC-blue)

## О проекте

**IBITIcoin** — модульная децентрализованная экосистема на BNB Smart Chain, включающая:

- `IBITIcoin.sol` — основной токен с возможностью покупки за BNB/USDT и динамическими комиссиями
- `StakingModule` — стекинг с гибкими параметрами вознаграждений
- `BuybackManager` — автоматический байбэк и сжигание токенов
- `DAO-модуль` — управление экосистемой через голосование
- `NFTDiscount` — скидки при покупке за счёт NFT
- `NFTSaleManager` — управление продажей и вестингом NFT
- `BridgeManager` — кросс-чейн мост
- `UserStatusManager` — блокировки, заморозка, статусы пользователей
- `VolumeWeightedOracle` — расчёт комиссий на основе объёма
- `MockUniswapV2Pair` — тестовый Pair для локальной разработки

---

## ⚙️ Функциональность

- Покупка токенов с учётом скидок и NFT-бонусов
- Аирдроп джекпотов при покупке токенов
- Динамическая комиссия в зависимости от объёма
- Автоматический байбэк и сжигание
- Стейкинг с начислением наград
- Поддержка DAO-голосования
- Продажа NFT с вестингом
- Кросс-чейн мост и статусный контроль пользователей

---

## 🌐 Демо

[🔗 Перейти на сайт](https://vovan1980.github.io/ibiticoin.github.io/)

---

## 📁 Структура репозитория

├── backend/ # Серверная часть (API, скрипты)
├── contracts/ # Solidity-контракты
├── frontend/ # Web-интерфейс покупки токенов и NFT
├── scripts/ # Скрипты деплоя и верификации
├── tests.zip # Архив с тестами (100% покрытие)
├── env.example # Пример .env
├── hardhat.config.js # Конфигурация Hardhat
├── package.json # Зависимости и команды
├── README.md # Текущий файл
└── коин.png # Логотип проекта

yaml
Копировать
Редактировать

---

## 🚀 Быстрый старт

```bash
git clone https://github.com/VOVAN1980/IBITIcoin.git
cd IBITIcoin
npm install
⚙️ Настройка окружения
Создайте .env на основе env.example и заполните:

env
Копировать
Редактировать
BSC_MAINNET_RPC_URL=
PRIVATE_KEY=
BSCSCAN_API_KEY=
USDT_ADDRESS=
🛠️ Команды Hardhat
Компиляция контрактов: npx hardhat compile

Запуск тестов: npx hardhat test

Верификация в Testnet:
npx hardhat run scripts/verify-testnet.js --network bscTestnet

📦 Развёрнутые контракты (BSC Testnet)
Модуль	Адрес
IBITIcoin	0x685B7FFE8fEB439601EF597c6E7F08b7566a622f
NFTDiscount	0x7d9294F0Fb9845C8060d5c630dc6D306a6F51FAe
NFTSaleManager	0xA1C56109B5b4fd740b51A03D3dA3507f527EA90b
StakingModule	0x4Ef7b929B6D685e8a4eD7C1d9D31a6603A7a589d
DAO-модуль	0x37dD8412e1499f1CF9d091baf358B823D14BC4C6
и др.	...

🧠 Развёрнутые контракты (BSC Mainnet)
Модуль	Адрес
IBITIcoin	0xa83825e09d3bf6ABf64efc70F08AdDF81A7Ba196
PhasedTokenSale	0x94b9a9b1FEC563cF16cA42a14c81C42284eD6Ca1
NFTSaleManager	0x804Fe412bF8B1e21475e6F6c368b0400250bBDdd
NFTDiscount	0x911f7153AA7554b3f936f2ad05318B8368c14668
BuybackManager	0xAfDFE70d3531582789D6Ba5Bd56fDCFd43a4AC5E
FeeManager	0x34770ba3625437742e18C6827DFC893c42Eec956
StakingModule	0xd5D138855C7D8F24CD9eE52B65864bC3929a0aA5
DAO-модуль	0xd5D170D80aDb59b189873540cFa25Ca508B336d3
UserStatusManager	0xa1542720cC6952ec1E528411cCdC58FE60fa7996
BridgeManager	0x813d2d93a3EfDFe8B09513b09B7CbdE06B239113
IBITI Oracle	0x09e28925487841f0400687FD9DC9cf1d14B85aF3
Team Vesting	0xA8E6a8707EBB386C839881f99391C8af2db3DB5e
IBITINFT	0xE14bfBB10180eda4bDC574f02700e0E2BC0A4667

🛠 Развёртывание в Mainnet
Обновите .env:

env
Копировать
Редактировать
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org/
PRIVATE_KEY=...
Деплой:

bash
Копировать
Редактировать
npx hardhat run scripts/deploy.js --network bsc
Верификация:

bash
Копировать
Редактировать
npx hardhat verify --network bsc <DeployAddress> --constructor-args args.js
🤝 Контрибуция
Форкните репозиторий

Создайте ветку feature/название

Добавьте изменения с тестами

Откройте Pull Request

📬 Контакты
Telegram: @IBITIcoin

Issues: GitHub Issues

📄 Лицензия
Проект распространяется под лицензией MIT. Подробнее — в файле LICENSE.

«Продолжая развивать IBITIcoin, мы шагнём в будущее DeFi и NFT с уверенностью и безопасностью.»
— команда IBITIcoin
