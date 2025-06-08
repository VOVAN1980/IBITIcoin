// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingModule {
    function stakeTokensFor(address staker, uint256 amount, uint256 duration) external;
    function unstakeTokensFor(address staker, uint256 index) external;
    function getStakeCount(address staker) external view returns (uint256);
}
