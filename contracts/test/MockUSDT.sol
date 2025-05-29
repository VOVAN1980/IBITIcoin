// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("MockUSDT", "mUSDT") {
        // Минтим 100 000 000 USDT с 6 десятичными
        _mint(msg.sender, 100_000_000 * 10 ** 6);
    }

    // Убираем предупреждение: теперь pure вместо view
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
