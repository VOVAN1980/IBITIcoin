# 🚀 IBITIcoin

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## О проекте

**IBITIcoin** — модульная децентрализованная экосистема на BNB Smart Chain, включающая:
- **IBITIcoin.sol** — основной токен с поддержкой покупки за BNB/USDT, динамическими комиссиями и интеграциями  
- **StakingModule** — механизм стекинга с вознаграждениями  
- **BuybackManager** — автоматический байбэк токенов и сжигание  
- **DAO-модуль** — гибкое управление через децентрализованное голосование  
- **NFTDiscount** — система скидок для держателей NFT  
- **NFTSaleManager** — продажа и вестинг специальных NFT  
- **BridgeManager** — кросс-чейн мост  
- **UserStatusManager** — управление статусами пользователей (блокировка, заморозка)  
- **VolumeWeightedOracle** — оракул для расчёта динамических комиссий  
- **MockUniswapV2Pair** — тестовый Pair для локальной разработки

## Структура репозитория

```
├── backend/                  # Серверная часть (API, скрипты)
├── contracts/                # Solidity-контракты
├── frontend/                 # Web-интерфейс покупки токенов и NFT
├── scripts/                  # Скрипты деплоя и верификации
├── tests.zip                 # Архив с тестами (покрытие 100% для основных модулей)
├── env.example               # Пример .env с переменными окружения
├── hardhat.config.js         # Конфигурация Hardhat
├── package.json              # Зависимости и команды
├── README.md                 # Текущий файл
├── LICENSE                   # MIT License
└── коин.png                  # Логотип проекта
```

## Быстрый старт

1. **Клонировать репозиторий**  
   ```bash
   git clone https://github.com/VOVAN1980/IBITIcoin.git
   cd IBITIcoin
   ```

2. **Установить зависимости**  
   ```bash
   npm install
   ```

3. **Настроить переменные окружения**  
   Скопируйте `env.example` в `.env` и заполните:
   ```
   BSC_TESTNET_RPC_URL=
   PRIVATE_KEY=
   BSCSCAN_API_KEY=
   USDT_ADDRESS=
   ```
   
4. **Компиляция контрактов**  
   ```bash
   npx hardhat compile
   ```

5. **Запуск локальных тестов**  
   ```bash
   npx hardhat test
   ```

6. **Верификация контрактов в Testnet**  
   ```bash
   npx hardhat run scripts/verify-testnet.js --network bscTestnet
   ```

## Развёрнутые контракты (BSC Testnet)

| Модуль                   | Адрес                                               |
|--------------------------|-----------------------------------------------------|
| ERC20Mock                | `0xf15692dAF9963A46D8518bCE93EAbd20012C287e`        |
| FeeManager               | `0x4bb2d1E1a75a0B5c0963EF8e1760EC1C7cb3C0e7`        |
| UserStatusManager        | `0x7B7cA67f7e9F613AFBd191375fa2DF5bA9211D34`        |
| BridgeManager            | `0xb9B511F02B8cC6934585A8b9BDC995Ee89c31605`        |
| NFTDiscount              | `0x7d9294F0Fb9845C8060d5c630dc6D306a6F51FAe`        |
| VolumeWeightedOracle     | `0x222E76b36B4C0A4121727a19d58010eB0c007d57`        |
| MockUniswapV2Pair        | `0x76ff136B22613483a62e86EA2e61A13b3Faa94bf`        |
| TeamVesting              | `0x499b9F15D8ab03eC8FB0D285C622B26a19685fa5`        |
| StakingModule            | `0x4Ef7b929B6D685e8a4eD7C1d9D31a6603A7a589d`        |
| DAOModuleImpl            | `0x37dD8412e1499f1CF9d091baf358B823D14BC4C6`        |
| IBITIcoin                | `0x685B7FFE8fEB439601EF597c6E7F08b7566a622f`        |
| IBITINFT                 | `0x1EE84a0b3685c2B8142138Cf4F55fD75CDE2ccC8`        |
| NFTSaleManager           | `0xA1C56109B5b4fd740b51A03D3dA3507f527EA90b`        |
| BuybackManager           | `0x20823848D1606c21C1102cf68d07cff89516Cf0D`        |

> **Внимание:** перед деплоем в Mainnet адаптируйте `.env`, проверьте параметры комиссий и приватный ключ.

## Развёртывание в Mainnet

1. Обновите `BSC_MAINNET_RPC_URL` и `PRIVATE_KEY` в `.env`.  
2. Запустите:
   ```bash
   npx hardhat run scripts/deploy.js --network bsc
   ```
3. Проверьте и верифицируйте контракты:
   ```bash
   npx hardhat verify --network bsc <DeployAddress> --constructor-args args.js
   ```

## Вклад и поддержка

1. Форкните проект.  
2. Создайте ветку `feature/имя_функционала`.  
3. Напишите код и тесты.  
4. Откройте Pull Request — мы максимально быстро проведём ревью и вольём изменения.

## Лицензия

Проект распространяется под **MIT License**. Подробности — в файле [LICENSE](LICENSE).

---

> _«Продолжая развивать IBITIcoin, мы шагнём в будущее DeFi и NFT с уверенностью и безопасностью.»_  
> — команда IBITIcoin
