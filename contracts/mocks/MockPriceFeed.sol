// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mock‑контракт для прайс‑фида, возвращающий заданное в конструкторе значение
contract MockPriceFeed {
    int256 private _answer;
    uint256 private _updatedAt;

    /// @param answer_ начальное значение price (с учётом 8 десятичных)
    constructor(int256 answer_) {
        _answer    = answer_;
        _updatedAt = block.timestamp;
    }

    /// @notice Число десятичных знаков
    function decimals() external pure returns (uint8) {
        return 8;
    }

    /// @notice Описание фида
    function description() external pure returns (string memory) {
        return "Mock Price Feed";
    }

    /// @notice Версия фида
    function version() external pure returns (uint256) {
        return 1;
    }

    /// @notice Данные последнего раунда
    /// @return roundId           Идентификатор раунда (0)
    /// @return answer            Значение price из конструктора
    /// @return startedAt         Время вызова (block.timestamp)
    /// @return updatedAt         Время установки ответа
    /// @return answeredInRound   Идентификатор раунда с ответом (0)
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId         = 0;
        answer          = _answer;
        startedAt       = block.timestamp;
        updatedAt       = _updatedAt;
        answeredInRound = 0;
    }
}
