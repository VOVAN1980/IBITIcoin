// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";           // ← добавлено
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Interface for a hold tracker contract which returns the holding duration for a given user.
interface IHoldTracker {
    function getHoldingDuration(address user) external view returns (uint256);
}

/// @title FeeManager
/// @notice Calculates transaction fees with base rates, adjustments (staking, VIP, whale, holding time),
///         volatility coefficient and NFT discount, clamped by min/max absolute fee.
contract FeeManager is Ownable, Pausable, ReentrancyGuard {        // ← добавлено Pausable
    struct UserActivity {
        uint256 lastTransactionTime;
        uint256 transactionCount;
        uint256 totalVolumeSum;
        uint256 buyCount;
        uint256 sellCount;
    }

    // Дополнительная структура для мульти-уровневой настройки волатильности
    struct VolatilityTier {
        uint256 volumeThreshold;     // Порог суммарного объёма
        uint256 volatilityValue;     // Коэффициент волатильности (в процентах), например 120 = 120%
    }

    // Массив пользовательских настроек волатильности (ступеней).
    // Пример: [ {volumeThreshold: 1_000_000, volatilityValue: 120}, {volumeThreshold: 5_000_000, volatilityValue: 150} ]
    VolatilityTier[] public volatilityTiers;
    /// @notice Максимальное число «ступеней» волатильности
    uint256 public constant MAX_VOLATILITY_TIERS = 10;
    mapping(address => UserActivity) private userActivities;

    // Base fees (percent)
    uint256 public baseBuyFee = 0;
    uint256 public baseSellFee = 10;

    // Absolute fee limits (in token units)
    uint256 public minFee = 0;
    uint256 public maxFee = type(uint256).max;

    // Time decay for activity reset
    uint256 public timeDecay = 7 days;

    // Volatility-based multiplier (percent)
    uint256 public volatilityCoefficient = 100;
    uint256 public highVolumeThreshold;
    uint256 public lowVolumeThreshold;
    uint256 public highVolatilityValue;
    uint256 public lowVolatilityValue;
    uint256 public defaultVolatilityCoefficient;
    // --- New events for admin-setters ---
    /// @notice Emitted when tokenContract is updated
    event TokenContractSet(address indexed tokenContract);
    /// @notice Emitted when holdTracker is updated
    event HoldTrackerSet(address indexed holdTracker);
    /// @notice Emitted when legacy volatility params are updated
    /// @notice Emitted when base buy/sell fees are updated
    event BaseFeesUpdated(uint256 baseBuyFee, uint256 baseSellFee);
    event LegacyVolatilityParamsUpdated(
        uint256 highVolumeThreshold,
        uint256 lowVolumeThreshold,
        uint256 highVolatilityValue,
        uint256 lowVolatilityValue,
        uint256 defaultVolatilityCoefficient
    );

    // Token contract allowed to call updateActivity
    address public tokenContract;
    uint256 public tokenDecimals;

    // Optional hold tracker (не используется после доработки calculateFee)
    IHoldTracker public holdTracker;

    // Activity window for total volume
    uint256 public totalVolumePeriod;
    uint256 public periodStartTime;

    // Precision for fee percentage (2 decimals)
    uint256 private constant PRECISION = 100;
    // --- Feature toggles for discounts ---
    /// Включает/отключает скидку за холд
    bool public holdDiscountEnabled;
    /// Включает/отключает скидку за VIP-статус
    bool public vipDiscountEnabled;
    /// Включает/отключает скидку за стейкинг
    bool public stakingDiscountEnabled;

    event ActivityUpdated(address indexed user, uint256 txCount, uint256 volume, uint256 lastTime);
    event FeeParametersUpdated(uint256 baseBuy, uint256 baseSell, uint256 minFee, uint256 maxFee, uint256 timeDecay);
    event VolatilityCoefficientUpdated(uint256 newCoefficient);
    event VolatilityTiersUpdated(VolatilityTier[] tiers);

    modifier onlyTokenContract() {
        require(msg.sender == tokenContract, "Only token contract");
        _;
    }

    constructor(address _tokenContract) {
        require(_tokenContract != address(0), "Invalid token contract");
        tokenContract = _tokenContract;
        periodStartTime = block.timestamp;

        // Determine token decimals
        try ERC20(_tokenContract).decimals() returns (uint8 dec) {
            tokenDecimals = dec;
        } catch {
            tokenDecimals = 18;
        }

         // сразу включаем все скидки по-умолчанию
         holdDiscountEnabled    = true;
         vipDiscountEnabled     = true;
         stakingDiscountEnabled = true;
      }

    /// @notice Экстренно приостановить все state-changing операции
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Снять приостановку
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Update which contract is allowed to call updateActivity
    function setTokenContract(address _tokenContract) external onlyOwner whenNotPaused {
        require(_tokenContract != address(0), "FM: zero tokenContract");
        tokenContract = _tokenContract;
        emit TokenContractSet(_tokenContract);
    }

    /// @notice Set external hold tracker for holding duration
    function setHoldTracker(address _holdTracker) external onlyOwner whenNotPaused {
        require(_holdTracker != address(0), "FM: zero holdTracker");
        holdTracker = IHoldTracker(_holdTracker);
        emit HoldTrackerSet(_holdTracker);
    }

    /// @notice Configure basic volatility params (legacy)
    function setVolatilityParams(
        uint256 _highVolumeThreshold,
        uint256 _lowVolumeThreshold,
        uint256 _highVolatilityValue,
        uint256 _lowVolatilityValue,
        uint256 _defaultVolatilityCoefficient
    ) external onlyOwner whenNotPaused {
        highVolumeThreshold = _highVolumeThreshold;
        lowVolumeThreshold = _lowVolumeThreshold;
        highVolatilityValue = _highVolatilityValue;
        lowVolatilityValue = _lowVolatilityValue;
        defaultVolatilityCoefficient = _defaultVolatilityCoefficient;
        emit LegacyVolatilityParamsUpdated(
            _highVolumeThreshold,
            _lowVolumeThreshold,
            _highVolatilityValue,
            _lowVolatilityValue,
            _defaultVolatilityCoefficient
        );
    }

    /**
     * @notice Новый метод для задания «ступеней» (tiers) волатильности.
     * @param tiers Массив (volumeThreshold, volatilityValue).
     * Пример: для 2 ступеней 
     * [
     *   { volumeThreshold: 1_000_000e18, volatilityValue: 120 }, // 120% волатильности при объёме > 1_000_000
     *   { volumeThreshold: 5_000_000e18, volatilityValue: 150 }  // 150% волатильности при объёме > 5_000_000
     * ]
     * При этом, если объём ниже первого порога, используем defaultVolatilityCoefficient.
     */
    function setVolatilityTiers(VolatilityTier[] calldata tiers) external onlyOwner whenNotPaused {
        require(tiers.length <= MAX_VOLATILITY_TIERS, "Too many tiers");
        delete volatilityTiers;
        uint256 prevThreshold = 0;
        for (uint256 i = 0; i < tiers.length; i++) {
            // Проверяем, что пороги идут в неубывающем порядке
            require(
                tiers[i].volumeThreshold >= prevThreshold,
                "Volatility tiers must be sorted"
            );
            prevThreshold = tiers[i].volumeThreshold;
            volatilityTiers.push(tiers[i]);
        }
        emit VolatilityTiersUpdated(tiers);
    }

    /// @notice Recalculate volatilityCoefficient based on totalVolumePeriod with multi-tier logic
    function auditParameters() public onlyOwner whenNotPaused {
        uint256 vol = (block.timestamp - periodStartTime <= 7 days) ? totalVolumePeriod : 0;

        // 1. Проверяем массив «ступеней» (tiers) — если пуст, используем старую логику
        if (volatilityTiers.length == 0) {
            // Старая логика
            if (vol >= highVolumeThreshold) {
                volatilityCoefficient = highVolatilityValue;
            } else if (vol <= lowVolumeThreshold) {
                volatilityCoefficient = lowVolatilityValue;
            } else {
                volatilityCoefficient = defaultVolatilityCoefficient;
            }
        } else {
            // 2. Применяем тировую логику
            // Сортировка массива не делается на лету — предполагаем, что владелец вводит в возрастающем порядке
            // если нужно, можно добавить проверку сортировки
            uint256 tierValue = defaultVolatilityCoefficient; 
            for (uint256 i = 0; i < volatilityTiers.length; i++) {
                if (vol >= volatilityTiers[i].volumeThreshold) {
                    tierValue = volatilityTiers[i].volatilityValue;
                } else {
                    break;
                }
            }
            volatilityCoefficient = tierValue;
        }

        emit VolatilityCoefficientUpdated(volatilityCoefficient);
    }

    /// @notice Alias for auditParameters
    function autoAdjustVolatilityCoefficient() external onlyOwner whenNotPaused {
        auditParameters();
    }

     /// @notice Админ: задать новые базовые комиссии (в процентах)
    function setBaseFees(uint256 _baseBuyFee, uint256 _baseSellFee)
        external onlyOwner whenNotPaused
    {
        require(_baseBuyFee <= 100 && _baseSellFee <= 100, "FM: fee>100");
        baseBuyFee  = _baseBuyFee;
        baseSellFee = _baseSellFee;
        emit BaseFeesUpdated(_baseBuyFee, _baseSellFee);
    }

    /// @notice Internal: update rolling volume window
    function _updateVolume(uint256 amount) internal {
        if (block.timestamp - periodStartTime > 7 days) {
            totalVolumePeriod = amount;
            periodStartTime = block.timestamp;
        } else {
            totalVolumePeriod += amount;
        }
    }

    /**
     * @notice Updates user activity for each token transaction.
     * @param user Address of the user.
     * @param amount Transaction amount.
     * @param isSell True for sell, false for buy.
     */
    function updateActivity(address user, uint256 amount, bool isSell)
        external
        onlyTokenContract
        nonReentrant
        whenNotPaused
    {
        UserActivity storage act = userActivities[user];
        uint256 delta = block.timestamp - act.lastTransactionTime;
        if (delta > timeDecay) {
            act.transactionCount = 0;
            act.totalVolumeSum = 0;
            act.buyCount = 0;
            act.sellCount = 0;
        }
        act.transactionCount++;
        act.totalVolumeSum += amount;
        if (isSell) act.sellCount++;
        else act.buyCount++;
        act.lastTransactionTime = block.timestamp;

        _updateVolume(amount);
        emit ActivityUpdated(user, act.transactionCount, act.totalVolumeSum, act.lastTransactionTime);
    }

    /**
     * @notice Calculates the fee amount for a transaction.
     * @dev The first address parameter is kept for interface compatibility but is not used in the current implementation.
     * @param _user Unused address parameter (kept for compatibility).
     * @param amount The transaction amount.
     * @param isBuy True if buy, false if sell.
     * @param stakingActive Whether staking discount applies.
     * @param isVIP VIP status discount.
     * @param isWhale Whale status penalty.
     * @param holdingDuration The holding duration (in seconds) for the user (provided by caller).
     * @param nftDiscount NFT discount percent (0–100).
     * @return fee Calculated fee in token units.
     */
    function calculateFee(
        address _user, // _user is intentionally not used; kept for interface compatibility.
        uint256 amount,
        bool isBuy,
        bool stakingActive,
        bool isVIP,
        bool isWhale,
        uint256 holdingDuration,
        uint256 nftDiscount
    ) external view returns (uint256 fee) {
        // Dummy usage to suppress unused variable warning.
        _user;
        // 1) holdingDuration сразу используем.
        // 2) Base percentage calculation.
        uint256 pct = _calculateFinalPercentage(isBuy, stakingActive, isVIP, isWhale, holdingDuration, nftDiscount);

        // 3) Apply volatility coefficient (теперь может устанавливаться через tiers)
        uint256 finalPct = (pct * volatilityCoefficient) / 100; // volatilityCoefficient - это проценты (100 = 100%)

         // 🔒 Clamp итоговый процент [0;50%] с учётом масштаба PRECISION
        uint256 maxPctScaled = 50 * PRECISION;
        if (finalPct > maxPctScaled) {
            finalPct = maxPctScaled;
        }

        // 4) Compute raw fee.
        uint256 rawFee = (amount * finalPct) / (100 * PRECISION);

        // 5) Clamp raw fee within [minFee, maxFee].
        if (rawFee < minFee) rawFee = minFee;
        if (rawFee > maxFee) rawFee = maxFee;
        return rawFee;
    }

    /**
     * @notice Internal: calculate fee percentage (scaled by PRECISION).
     */
    function _calculateFinalPercentage(
        bool isBuy,
        bool stakingActive,
        bool isVIP,
        bool isWhale,
        uint256 holdingDuration,
        uint256 nftDiscount
    ) internal view returns (uint256) {
        // 1) Если это покупка, возвращаем baseBuyFee * PRECISION
        if (isBuy) {
            return baseBuyFee * PRECISION;
        }
        // 2) Продажа
        int256 pct = int256(baseSellFee);

        // Скидка за стейкинг
        if (stakingDiscountEnabled && stakingActive) {
            uint256 pctUint = uint256(pct);
            pctUint = (pctUint * 90) / 100; // 90% от базовой ставки
            pct = int256(pctUint);
        }
        // Скидка за VIP
        if (vipDiscountEnabled && isVIP) {
            pct -= 2;
        }
        // Наценка для whale (остается всегда)
        if (isWhale) {
            pct += 3;
        }
        // Скидка за холд
        if (holdDiscountEnabled) {
            if (holdingDuration > 60 days) {
                pct -= 2;
            } else if (holdingDuration > 30 days) {
                pct -= 1;
            }
        }

        // Границы (0% — 50%)
        if (pct < 0) pct = 0;
        if (pct > 50) pct = 50;

        // Применяем NFT-скидку
        uint256 adj = uint256(pct);
        if (nftDiscount >= 100) return 0;
        return adj * (100 - nftDiscount) * PRECISION / 100;
    }

    // --- Admin setters with event emissions ---
    function setBaseBuyFee(uint256 fee) external onlyOwner whenNotPaused {
        baseBuyFee = fee;
        emit FeeParametersUpdated(baseBuyFee, baseSellFee, minFee, maxFee, timeDecay);
    }

    function setBaseSellFee(uint256 fee) external onlyOwner whenNotPaused {
        baseSellFee = fee;
        emit FeeParametersUpdated(baseBuyFee, baseSellFee, minFee, maxFee, timeDecay);
    }

    function setMinFee(uint256 fee) external onlyOwner whenNotPaused {
        minFee = fee;
        emit FeeParametersUpdated(baseBuyFee, baseSellFee, minFee, maxFee, timeDecay);
    }

    function setMaxFee(uint256 fee) external onlyOwner whenNotPaused {
        maxFee = fee;
        emit FeeParametersUpdated(baseBuyFee, baseSellFee, minFee, maxFee, timeDecay);
    }

    function setTimeDecay(uint256 decay) external onlyOwner whenNotPaused {
        timeDecay = decay;
        emit FeeParametersUpdated(baseBuyFee, baseSellFee, minFee, maxFee, timeDecay);
    }

    // --- Feature-toggle setters ---
    /// @notice Включить/отключить скидку за холд
    function setHoldDiscountEnabled(bool enabled) external onlyOwner whenNotPaused {
        holdDiscountEnabled = enabled;
    }
    /// @notice Включить/отключить скидку за VIP
    function setVipDiscountEnabled(bool enabled) external onlyOwner whenNotPaused {
        vipDiscountEnabled = enabled;
    }
    /// @notice Включить/отключить скидку за стейкинг
    function setStakingDiscountEnabled(bool enabled) external onlyOwner whenNotPaused {
        stakingDiscountEnabled = enabled;
    }

 }
