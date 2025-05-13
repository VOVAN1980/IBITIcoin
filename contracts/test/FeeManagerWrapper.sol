// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/FeeManager.sol";

contract FeeManagerWrapper is FeeManager {
    constructor(address token) FeeManager(token) {}

    function testCalculateFee(
        address user,
        uint256 amount,
        bool isBuy,
        bool isStaking,
        bool isVIP,
        bool isWhale,
        uint256 holdingTime,
        uint256 nftDiscount
    ) external view returns (uint256) {
        return this.calculateFee(user, amount, isBuy, isStaking, isVIP, isWhale, holdingTime, nftDiscount);
        // ↑ исправлено: вызов через `this` для внешнего метода
    }
}
