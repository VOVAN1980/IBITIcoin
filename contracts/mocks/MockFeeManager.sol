// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Минимальный stub для FeeManager
contract MockFeeManager {
    /// @dev Всегда возвращаем 0 комиссии
    function calculateFee(
        address, uint256, bool, bool, bool, bool, uint256, uint256
    ) external pure returns (uint256) {
        return 0;
    }
    /// @dev Пустой вызов для updateActivity
    function updateActivity(
        address, uint256, bool
    ) external pure {}
}
