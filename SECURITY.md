# Security Policy

## Supported Versions

This repository contains production smart contracts deployed on BNB Smart Chain.
Only the latest version on the `main` branch is considered supported.

Historical commits and experimental branches are provided for reference only.

---

## Reporting a Vulnerability

If you discover a potential security issue, vulnerability, or unexpected behavior:

- **Do NOT** open a public GitHub issue.
- **Do NOT** disclose the issue publicly before it is reviewed.

Please report security issues via one of the official project channels listed on:
https://www.ibiticoin.com

Include as much technical detail as possible:
- contract name(s)
- function(s) involved
- transaction examples (if applicable)
- impact assessment

---

## Scope

In scope:
- Smart contracts in the `contracts/` directory
- Deployment scripts in `scripts/`
- Contract interactions that may affect token supply, fees, vesting, or governance

Out of scope:
- Third-party interfaces (Chainlink, Uniswap/Pancake interfaces)
- User-side wallet issues
- UI / frontend issues

---

## Disclaimer

This repository is provided "as is".
No guarantees are made regarding the absence of vulnerabilities.
Always perform independent audits and testing before interacting with smart contracts.
