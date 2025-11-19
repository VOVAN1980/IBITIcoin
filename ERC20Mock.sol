// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// File: contracts/ERC20Mock.sol

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract ERC20Mock is ERC20, ERC20Burnable {
    constructor(
      string memory name,
      string memory symbol,
      address initialAccount,
      uint256 initialBalance
    ) ERC20(name, symbol) {
        _mint(initialAccount, initialBalance);
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    // give tests a way to mint extra tokens
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}