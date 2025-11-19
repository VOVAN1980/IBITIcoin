// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PriceOracleMock {
    uint256 public price = 1e16; // 0.01

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getPrice() external view returns (uint256) {
        return price;
    }
}
