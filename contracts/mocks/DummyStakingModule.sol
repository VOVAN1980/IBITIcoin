// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IStakingModule.sol";

contract DummyStakingModule is IStakingModule {
    function stakeTokensFor(address, uint256, uint256) external pure override {
        // no-op
    }
    function unstakeTokensFor(address, uint256) external pure override {
        // no-op
    }
    function getStakeCount(address) external pure override returns (uint256) {
        return 0;
    }
}
