# Deployment Notes

This document describes the general deployment approach used for IBITIcoin contracts.
Exact deployment parameters depend on environment configuration.

---

## Tooling

- Hardhat
- Node.js
- npm

Deployment scripts are located in the `scripts/` directory.

---

## Environment Setup

Create a `.env` file based on `.env.example`.

Typical variables include:
- RPC URL
- Private key for deployment wallet
- API keys for contract verification (if used)

Never commit `.env` files.

---

## Compilation

```bash
npx hardhat compile
Deployment
Example mainnet deployment:

bash
Копировать код
npx hardhat run scripts/deploy-mainnet.js --network bsc
The deployment script handles:

contract deployment

constructor parameters

initial configuration where applicable

Verification
After deployment, contracts may be verified using:

bash
Копировать код
npx hardhat run scripts/verify-mainnet.js --network bsc
Verification parameters must match deployed bytecode and constructor arguments.

Notes
Deployment order matters for interdependent modules.

Allowances, ownership transfers, and configuration steps are explicit and on-chain.

Always verify deployed addresses before publishing them as official.
