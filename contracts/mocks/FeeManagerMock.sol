// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../FeeManager.sol";

contract FeeManagerMock is FeeManager {
    uint256 public mockFee;

    constructor(address _paymentToken) FeeManager(_paymentToken) {}

    function setMockFee(uint256 amt) external {
        mockFee = amt;
    }

    // remove override if original is not virtual
    function calculateFee(address, uint256 amt, bool) public view returns (uint256 fee) {
        return amt > mockFee ? mockFee : amt;
    }
}
