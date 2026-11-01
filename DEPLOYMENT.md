# Deployment Notes

The deployment order used for IBITIcoin contracts. Mainnet transactions are signed on Ledger only: no private keys are kept in
the environment. Every script that sends a transaction only prints what it would do unless its confirmation variable is set.

---

## Environment Setup

Create a `.env` file based on `.env.example`. Never commit `.env` files.

```bash
npm ci
```

```bash
npm test
```

---

## Token and Vesting

The token mints straight into its recipients, and the vesting contract is deployed first with the predicted token address.
The journal in `deployments/<network>.json` allows an interrupted deployment to resume.

Read-only check of the network, the wallet and the distribution plan:

```bash
npm run preflight:mainnet
```

Deploy:

```bash
npm run deploy:mainnet
```

Check the result on-chain:

```bash
npm run check:mainnet
```

Publish the sources on BscScan:

```bash
npm run verify:mainnet
```

---

## Website Sale

`scripts/05-deploy-promo-sale.js` deploys `IBITIPromoSale` paused. The journal is `deployments/<network>.promo-sale.json`.
`scripts/fund-promo-sale.js` sends the stock by a plain transfer, with no approval.
`scripts/06-enable-promo-sale.js` lifts the pause only if the stock, the price and the reserve wallet are correct.

---

## Liquidity

`scripts/04-add-liquidity.js` adds IBITI/USDT liquidity on PancakeSwap V2. It approves the exact amounts and resets both
allowances to zero afterwards, including when adding liquidity fails.

---

## Testnet

The same scripts run on `bscTestnet`. Testnet uses its own USDT with 18 decimals, deployed by `scripts/testnet-usdt.js`,
because the real USDT on BSC has 18 decimals. `scripts/testnet-vesting-check.js` and `scripts/testnet-promo-check.js` run the
vesting and the sale end to end.
