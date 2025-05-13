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
        emit PoolRemoved(pool);
    }

    /**
     * @notice Returns IBITI/USD price scaled by 10**decimals
     * @dev price_i = reserve1 * 10**decimals / reserve0; weight = reserve0
     */
    function getPrice() external view whenNotPaused returns (uint256 price) {
    // Кэшируем state-поля в memory для экономии газа и отсутствия shadowing
    IUniswapV2Pair[] memory localPools = pools;
    uint8 stableDecimals = decimals;
    uint256 len = localPools.length;

    uint256 totalWeight = 0;
    uint256 weightedSum  = 0;

    for (uint256 i = 0; i < len; i++) {
        IUniswapV2Pair p = localPools[i];
        (uint112 r0, uint112 r1, ) = p.getReserves();
        if (r0 == 0 || r1 == 0) {
            continue;
        }
        uint256 price_i = (uint256(r1) * (10 ** stableDecimals)) / uint256(r0);
        totalWeight   += r0;
        weightedSum   += price_i * r0;
    }

    if (totalWeight == 0) {
        return 0;
    }
    return weightedSum / totalWeight;
    }

     /// @notice Number of configured pools
    function poolCount() external view returns (uint256) {
    return pools.length;
   }
}
