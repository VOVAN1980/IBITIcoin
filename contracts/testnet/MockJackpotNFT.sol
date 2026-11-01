// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @notice Только для тестов стейкинга: записывает выдачу Jackpot NFT и умеет падать.
contract MockJackpotNFT {
    struct Mint {
        address to;
        uint256 discountPercent;
        string uri;
    }

    Mint[] public mints;
    mapping(string => bool) public usedUri;
    bool public failing;

    function setFailing(bool failing_) external {
        failing = failing_;
    }

    function mintJackpot(address to, uint256 discountPercent, string calldata tokenURI) external {
        require(!failing, "mint failed");
        require(!usedUri[tokenURI], "URI already used");
        usedUri[tokenURI] = true;
        mints.push(Mint(to, discountPercent, tokenURI));
    }

    function mintCount() external view returns (uint256) {
        return mints.length;
    }
}
