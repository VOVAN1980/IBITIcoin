// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

/**
 * @title VolumeWeightedOracle
 * @notice Aggregates IBITI price in USD across multiple DEX pools using volume‑weighted average.
 *         Owner can add/remove pools. No external dependencies.
 *         Added mechanism for emergency pause through Pausable.
 */
contract VolumeWeightedOracle is Ownable, Pausable {
    IUniswapV2Pair[] public pools;
    mapping(address => uint256) private indexInPools; // 1-based index in pools array
    uint8 public decimals; // decimals of the USD‑stable token in each pool
    uint256 public lastPrice;
    uint256 public lastPriceTimestamp;
    uint256 public priceUpdateInterval = 600; // 10 минут

    event PoolAdded(address indexed pool);
    event PoolRemoved(address indexed pool);

    constructor(uint8 _decimals) {
        decimals = _decimals;
    }

    /// @notice Emergency pause for all operations
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume operations
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Add a new UniswapV2‑style pool (IBITI/token1)
    function addPool(address pool) external onlyOwner whenNotPaused {
        require(pool != address(0), "Zero address");
        require(indexInPools[pool] == 0, "Pool exists");
        pools.push(IUniswapV2Pair(pool));
        indexInPools[pool] = pools.length;
        emit PoolAdded(pool);
    }

    /// @notice Remove an existing pool
    function removePool(address pool) external onlyOwner whenNotPaused {
        uint256 idx1 = indexInPools[pool];
        require(idx1 != 0, "Pool not found");
        uint256 idx = idx1 - 1;
        uint256 last = pools.length - 1;
        if (idx != last) {
            IUniswapV2Pair lastPool = pools[last];
            pools[idx] = lastPool;
            indexInPools[address(lastPool)] = idx + 1;
        }
        pools.pop();
        delete indexInPools[pool];
        // Сбрасываем кэш цены при изменении списка пулов
        lastPrice = 0;
        lastPriceTimestamp = 0;
        emit PoolRemoved(pool);
    }

    function updatePrice() public whenNotPaused returns (uint256) {
       require(block.timestamp >= lastPriceTimestamp + priceUpdateInterval, "Too early");

        uint256 totalWeight = 0;
        uint256 weightedSum = 0;

        for (uint256 i = 0; i < pools.length; i++) {
            (uint112 r0, uint112 r1, ) = pools[i].getReserves();
            if (r0 == 0 || r1 == 0) continue;
            uint256 price_i = (uint256(r1) * (10 ** decimals)) / uint256(r0);
            totalWeight += r0;
            weightedSum += price_i * r0;
        }

        uint256 newPrice = totalWeight == 0 ? 0 : weightedSum / totalWeight;
        lastPrice = newPrice;
        lastPriceTimestamp = block.timestamp;
        return newPrice;
    }

    function getPrice() external view whenNotPaused returns (uint256) {
        return lastPrice;
    }

     /// @notice Number of configured pools
    function poolCount() external view returns (uint256) {
    return pools.length;
   }
}
