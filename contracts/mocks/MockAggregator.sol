// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Chainlink AggregatorV3Interface
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @notice Mock implementation of Chainlink AggregatorV3Interface for local tests
contract MockAggregator is AggregatorV3Interface {
    uint8 public override decimals;
    string public override description = "MockAggregator";
    uint256 public override version = 0;
    int256 private answer;

    constructor(uint8 _decimals) {
        decimals = _decimals;
    }

    /// @notice Set mock price (e.g. 2000 * 10^8)
    function setPrice(int256 _price) external {
        answer = _price;
    }

    /// @notice Return latest round data: roundId, answer, startedAt, updatedAt, answeredInRound
    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 _answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, answer, 0, 0, 0);
    }

    /// @notice Not used in tests; revert if called
    function getRoundData(uint80)
        external
        pure
        override
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        revert("Not implemented");
    }
}
