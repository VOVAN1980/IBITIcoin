// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AttackContract.sol";

/// @notice Мок‑токен для симуляции reentrancy в unstakeTokens()
contract ReentrantMockToken {
    AttackContract public attacker;
    uint256 public calls;

    /// @notice Устанавливаем адрес атакующего
    function setAttacker(address _attacker) external {
        attacker = AttackContract(_attacker);
    }

    /// @notice Целевая функция unstakeTokens
    function unstakeTokens() external {
        calls++;
        // при первом вызове пробуем reentrancy через fallback
        if (calls < 2) {
            // вызов без данных → сработает fallback() в AttackContract
            (bool success, ) = address(attacker).call("");
            require(success, "fallback call failed");
        }
    }
}
