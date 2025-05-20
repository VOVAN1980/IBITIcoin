// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract NFTDiscountMock {
    event JackpotMinted(address indexed user, uint256 discount, string uri);

    function mintJackpot(address user, uint256 discount, string memory uri) external {
        emit JackpotMinted(user, discount, uri);
    }
}
