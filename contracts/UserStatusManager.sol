// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title UserStatusManager
 * @notice Даёт «метры» для VIP-, Whale- и Bot-статусов, а также
 *         возможность owner-у менять все пороги одной транзакцией.
 *
 *         - VIP-порог по умолчанию:   1 000 IBI (8 decimals)
 *         - Whale-порог по умолчанию: 100 000 IBI
 *
 * ⛑  Контракт не требует аргументов в конструкторе —
 *     адрес токена можно выставить позже:
 *       - первый раз через setIBIToken(...)
 *       - при необходимости сменить — через overrideIBIToken(...)
 */
interface IERC20Decimals {
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract UserStatusManager is Ownable, Pausable {
    /*───────────────────  события  ───────────────────*/
    event IBITokenSet(address token);
    event ThresholdsUpdated(uint256 vip, uint256 whale, uint256 stake, uint256 holdDays);
    event VIPOverride(address indexed user, bool flag);
    event WhaleOverride(address indexed user, bool flag);
    event BotFlagUpdated(address indexed user, bool flag);

    /*───────────────────  хранение  ───────────────────*/
    IERC20Decimals public ibiToken;   // адрес IBI-токена
    bool private tokenSet;

    uint256 public vipThreshold  = 1_000 * 1e8;      // 1 000 IBI
    uint256 public whaleThreshold = 100_000 * 1e8;   // 100 000 IBI
    uint256 public stakeThreshold;                   // 0 = отключено
    uint256 public holdThresholdDays;                // 0 = отключено

    mapping(address => bool) private vipOverrides;
    mapping(address => bool) private whaleOverrides;
    mapping(address => bool) private flaggedBots;

    /*───────────────  owner-функции  ───────────────*/

    /// @notice Разово задаём адрес IBITI-токена (первичная привязка).
    /// Используем при первом деплое.
    function setIBIToken(address token) external onlyOwner {
        require(!tokenSet,          "token already set");
        require(token != address(0),"zero addr");
        ibiToken = IERC20Decimals(token);
        tokenSet = true;
        emit IBITokenSet(token);
    }

    /// @notice Форсированно переопределяем адрес токена,
    ///         если уже был задан ранее. Использовать осознанно.
    ///
    /// Сценарий: выпустили новый IBITI v2/v3, хотим,
    /// чтобы VIP/whale-логика работала с новым токеном.
    function overrideIBIToken(address token) external onlyOwner {
        require(token != address(0), "zero addr");
        ibiToken = IERC20Decimals(token);
        tokenSet = true;
        emit IBITokenSet(token);
    }

    /// @notice Единый «метр» для всех порогов
    function setThresholds(
        uint256 vip,
        uint256 whale,
        uint256 stake,
        uint256 holdDays
    ) external onlyOwner {
        vipThreshold      = vip;
        whaleThreshold    = whale;
        stakeThreshold    = stake;
        holdThresholdDays = holdDays;
        emit ThresholdsUpdated(vip, whale, stake, holdDays);
    }

    /*-- ручные флаги --*/
    function setVIPOverride(address u, bool f)   external onlyOwner {
        vipOverrides[u] = f;
        emit VIPOverride(u, f);
    }

    function setWhaleOverride(address u, bool f) external onlyOwner {
        whaleOverrides[u] = f;
        emit WhaleOverride(u, f);
    }

    function flagBot(address u, bool f) external onlyOwner {
        flaggedBots[u] = f;
        emit BotFlagUpdated(u, f);
    }

    /*───────────────  pause  ───────────────*/
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /*───────────────  чтение статусов  ───────────────*/

    function isVIPUser(address u) public view returns (bool) {
        if (vipOverrides[u]) return true;
        if (!tokenSet)       return false;
        return ibiToken.balanceOf(u) >= vipThreshold;
    }

    function isWhale(address u) public view returns (bool) {
        if (whaleOverrides[u]) return true;
        if (!tokenSet)         return false;
        return ibiToken.balanceOf(u) >= whaleThreshold;
    }

    function isFlaggedBot(address u) external view returns (bool) {
        return flaggedBots[u];
    }

    /*-- вспомогательные бонус-проверки (если нужны) --*/

    function isStakeQualified(uint256 stakeAmt) external view returns (bool) {
        return stakeThreshold > 0 && stakeAmt >= stakeThreshold;
    }

    function hasHoldBonus(uint256 startTime) external view returns (bool) {
        if (holdThresholdDays == 0) return false;
        return block.timestamp - startTime >= holdThresholdDays * 1 days;
    }
}
