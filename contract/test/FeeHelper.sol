// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../FeeManager.sol";

/// @notice Вспомогательный контракт для проксирования updateActivity
contract FeeHelper {
    FeeManager public fm;

    constructor(address _feeManager) {
        fm = FeeManager(_feeManager);
    }

    /// @notice Вызываем updateActivity от адреса helper
    function doActivity(address user, uint256 amount) external {
        // isSell = false
        fm.updateActivity(user, amount, false);
    }
}
