// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DAOModule.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./NFTDiscount.sol";

/**
 * @title DAOModuleImplementation
 * @notice Пример конкретной реализации DAOModule, привязывающийся к конкретному ERC20 и NFTDiscount.
 */
contract DAOModuleImplementation is DAOModule {
    ERC20 private tokenInstance;
    NFTDiscount private nftDiscountInstance;

    // Конструктор принимает адрес токена и NFTDiscount
    constructor(ERC20 _token, NFTDiscount _nftDiscount) {
        tokenInstance = _token;
        nftDiscountInstance = _nftDiscount;
    }

    // Реализация функции getToken
    function getToken() public view override returns (ERC20) {
        return tokenInstance;
    }

    // Реализация функции getNFTDiscount
    function getNFTDiscount() public view override returns (NFTDiscount) {
        return nftDiscountInstance;
    }
}
