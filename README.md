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
- `FeeManager.sol
- `PhasedTokenSale.sol
- `IBITINFT.sol
- `TeamVesting.sol
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

## 🌐 Сайт проекта

[🌍 ibiticoin.com](https://www.ibiticoin.com/)
-
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
FEE_MANAGER_ADDRESS=0xeF25d90ad6911bF25a56D1A2b154db79C7979143
USER_STATUS_MANAGER_ADDRESS=0x8Afd09f0394836E39B6B88Ad5101d5B826f836F9
BRIDGE_MANAGER_ADDRESS=0x9F95A8711392329065a290d7ec62F02C4D37441B
NFTDISCOUNT_ADDRESS=0x29cE5782d4e7D97f06C0E7b6d5D4f92264f1519a
IBITI_PRICE_ORACLE_ADDRESS=0x9A2452F1517dF7e55b132De8F5268B9b56Cb37ae
TEAM_VESTING_ADDRESS=0x1F7F2C95fdb9a206e6deac95CfCad176CFb36110
STAKING_MODULE_ADDRESS=0xC1792854bD81AF5b1Fb326e0880365F76EA279EA
DAO_MODULE_ADDRESS=0x3eb4eCc5B7035626335d2D032a17dEDc3a9C9c62
IBITI_TOKEN_ADDRESS=0xc230f9394875305ac83013C0186a400865bc8f86
IBITINFT_ADDRESS=0xF7d5Fe8586FFf60b8905dB4b84B7bDafB1199545
NFTSALEMANAGER_ADDRESS=0xA789e8E13F1Fec071cd2dd418438C35Dba130472
BUYBACK_MANAGER_ADDRESS=0x64c77f7E9D42892488e77A4417D67A4667823e7E
PHASED_TOKENSALE_ADDRESS=0x3141940d64fE4B40c6d1D5148B6B45473F83bD5f

🧠 Развёрнутые контракты (BSC Mainnet)
Модуль	Адрес
USDT_TOKEN_ADDRESS_MAINNET=0x55d398326f99059fF775485246999027B3197955
PANCAKESWAP_ROUTER_ADDRESS_MAINNET=0x10ED43C718714eb63d5aA57B78B54704E256024E

FEE_MANAGER_ADDRESS_MAINNET=0x34770ba3625437742e18C6827DFC893c42Eec956
USER_STATUS_MANAGER_ADDRESS_MAINNET=0xf1C734156A2Ab62e1018D18f6347425623af611a
BRIDGE_MANAGER_ADDRESS_MAINNET=0x813d2d93a3EfDFe8B09513b09B7CbdE06B239113
NFTDISCOUNT_ADDRESS_MAINNET=0x911f7153AA7554b3f936f2ad05318B8368c14668
IBITI_PRICE_ORACLE_ADDRESS_MAINNET=0x09e28925487841f0400687FD9DC9cf1d14B85aF3
TEAM_VESTING_ADDRESS_MAINNET=0xae6fA65adede487e46ABCE1b3570063D02510d5d
IBITINFT_ADDRESS_MAINNET=0xE14bfBB10180eda4bDC574f02700e0E2BC0A4667
IBITI_TOKEN_ADDRESS_MAINNET=0x47F2FFCb164b2EeCCfb7eC436Dfb3637a457B9bb
STAKING_MODULE_ADDRESS_MAINNET=0x9ad8D68F7a6C9f673bd1db8348734f8dA515113c
DAO_MODULE_ADDRESS_MAINNET=0xc0213d9d331Ea207717E38F5e0e995BA567fbd1F
PHASED_TOKENSALE_ADDRESS_MAINNET=0x6A6eDc85f4690DBAB98d52CdF656ef849d28148e
NFTSALEMANAGER_ADDRESS_MAINNET=0x2c702A42966a939b6C5Da4828cd8D67890Db097E
BUYBACK_MANAGER_ADDRESS_MAINNET=0xdE7E16bbDe9076daF23DB25BA4E50d8FEeca5AC9

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
Наш сайт, и  каналы.
сайт   -     www.ibiticoin.com 
фейсбук - https://www.facebook.com/ibiticoin.ibiticoin
твитер, -  https://x.com/ibiticoin
телеграм, -t.me/IBITIcoin_chat
линкед, -www.linkedin.com/in/ibiticoin
Issues: GitHub Issues

Документация
- White Paper проекта IBITI
- Ibiti White Paper En


📄 Лицензия
Проект распространяется под лицензией MIT. Подробнее — в файле LICENSE.

«Продолжая развивать IBITIcoin, мы шагнём в будущее DeFi и NFT с уверенностью и безопасностью.»
— команда IBITIcoin
