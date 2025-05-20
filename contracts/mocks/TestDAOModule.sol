// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../DAOModule.sol";
import "../NFTDiscount.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestDAOModule
 * @notice Тестовая реализация DAOModule для проверки логики голосования и работы с NFTDiscount.
 */
contract TestDAOModule is DAOModule {
    ERC20 public token;
    NFTDiscount public nftDiscount;
    
    constructor(ERC20 _token, NFTDiscount _nftDiscount) {
        token = _token;
        nftDiscount = _nftDiscount;
    }
    
    function getToken() public view override returns (ERC20) {
        return token;
    }
    
    function getNFTDiscount() public view override returns (NFTDiscount) {
        return nftDiscount;
    }
}
