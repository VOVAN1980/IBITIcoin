// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Только для BSC testnet: USDT с 18 знаками, как настоящий BSC-USDT.
///         mUSDT с 8 знаками на прошлом testnet скрыл ошибку цены V1.
contract TestUSDT is ERC20 {
    constructor() ERC20("Test USDT (18 decimals)", "tUSDT18") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }
}
