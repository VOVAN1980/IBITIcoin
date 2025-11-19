// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockNFTDiscount — заглушка для NFTDiscount
contract MockNFTDiscount {
    // хранит, был ли уже использован токен
    mapping(address => mapping(uint256 => bool)) private _used;

    /// @notice Разрешаем или запрещаем минировать Jackpot-NFT
    function setJackpotMinter(address /*minter*/, bool /*enabled*/) external {
        // ничего не делаем
    }

    /// @notice Заглушка для минтинга Jackpot-NFT
    function mintJackpot(
        address /*to*/,
        uint256 /*discountPercent*/,
        string calldata /*uri*/
    ) external {
        // ничего не делаем
    }

    /// @notice Инициализируем дисконт (только для тестов)
    function setDiscountData(
        address user,
        uint256 tokenId,
        uint256 /*discountPercent*/,
        uint256 /*unused*/
    ) external {
        // считаем, что токен существует, но ещё не использован
        _used[user][tokenId] = false;
    }

    /// @notice Вызывается из IBITIcoin для пометки, что дисконт применён
    function useDiscountFor(address user, uint256 tokenId) external {
        _used[user][tokenId] = true;
    }

    /// @notice Проверяем в тесте, был ли дисконт использован
    function usedBy(address user, uint256 tokenId) external view returns (bool) {
        return _used[user][tokenId];
    }
}
