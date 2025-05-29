// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Простой стаб — всегда 10% от суммы
contract FeeManagerStub {
    function calculateFee(
        address, uint256 amt,
        bool, bool, bool, bool, uint256, uint256
    ) external pure returns (uint256) {
        return (amt * 10) / 100;
    }
    function updateActivity(address, uint256, bool) external pure {}
}
