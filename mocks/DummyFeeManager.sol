// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DummyFeeManager {
  // Всегда возвращает 0 комиссии
  function calculateFee(
    address, uint256, bool, bool, bool, bool, uint256, uint256
  ) external pure returns (uint256) {
    return 0;
  }
}
