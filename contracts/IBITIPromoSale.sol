// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title IBITIPromoSale
 * @notice Контракт сайта: покупка IBITI за USDT с бонусом и реферальной наградой.
 *
 *         Цена фиксированная, не зависит от пула: price — сколько минимальных единиц USDT
 *         стоит 1 целый IBITI. IBITI = USDT × 10^8 / price.
 *
 *         IBITI выдаётся только с баланса этого контракта: снять токены с чужого кошелька
 *         он не может. Запас пополняется обычным переводом, approve не нужен.
 *         USDT сразу уходит на reserveWallet и на контракте не лежит.
 *
 *         Контракт создаётся на паузе. Цену и лимиты можно менять только на паузе.
 */
contract IBITIPromoSale is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant IBITI_DECIMALS = 8;
    uint8 public constant PAYMENT_DECIMALS = 18;
    /// Защита от цены с неверными знаками: так нельзя выставить цену вроде 100000 из V1.
    uint256 public constant MIN_PRICE = 1e15; // $0,001
    uint256 public constant MAX_PRICE = 1e19; // $10
    uint256 public constant MAX_BONUS_BPS = 2000; // 20%

    IERC20 public immutable paymentToken;
    IERC20 public immutable ibitiToken;
    address public immutable reserveWallet;
    uint256 public immutable bonusBps;
    uint256 public immutable refReward;

    uint256 public price;
    uint256 public minPaymentAmount;
    uint256 public maxPaymentAmount;
    bool public promoActive;
    uint256 public promoEndTime; // 0 = без срока

    uint256 public soldTotal;
    uint256 public bonusSpent;
    uint256 public refSpent;
    mapping(address => bool) public referralUsed;

    event PromoBuy(
        address indexed buyer,
        address indexed referrer,
        uint256 paymentAmount,
        uint256 boughtAmount,
        uint256 bonusAmount,
        uint256 refAmount
    );
    event PriceUpdated(uint256 price);
    event BuyLimitsUpdated(uint256 minPayment, uint256 maxPayment);
    event PromoActiveUpdated(bool active);
    event PromoEndTimeUpdated(uint256 endTime);
    event IbitiWithdrawn(address indexed to, uint256 amount);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error WrongDecimals(address token, uint8 decimals);
    error PriceOutOfRange(uint256 price);
    error BonusTooHigh(uint256 bonusBps);
    error BadLimits();
    error PromoInactive();
    error PromoEnded();
    error AmountBelowMin(uint256 amount, uint256 min);
    error AmountAboveMax(uint256 amount, uint256 max);
    error ZeroAmount();
    error Slippage(uint256 bought, uint256 minOut);
    error InsufficientInventory(uint256 needed, uint256 available);
    error RescueIbitiForbidden();
    error RenounceDisabled();

    constructor(
        address paymentToken_,
        address ibitiToken_,
        address owner_,
        address reserveWallet_,
        uint256 price_,
        uint256 bonusBps_,
        uint256 refReward_,
        uint256 minPayment_,
        uint256 maxPayment_
    ) {
        if (paymentToken_ == address(0) || ibitiToken_ == address(0) || owner_ == address(0) || reserveWallet_ == address(0)) {
            revert ZeroAddress();
        }
        // USDT с другими знаками или другой токен не пройдут: так был спрятан слив V1.
        uint8 payDec = IERC20Metadata(paymentToken_).decimals();
        if (payDec != PAYMENT_DECIMALS) revert WrongDecimals(paymentToken_, payDec);
        uint8 ibitiDec = IERC20Metadata(ibitiToken_).decimals();
        if (ibitiDec != IBITI_DECIMALS) revert WrongDecimals(ibitiToken_, ibitiDec);
        if (bonusBps_ > MAX_BONUS_BPS) revert BonusTooHigh(bonusBps_);

        paymentToken = IERC20(paymentToken_);
        ibitiToken = IERC20(ibitiToken_);
        reserveWallet = reserveWallet_;
        bonusBps = bonusBps_;
        refReward = refReward_;

        _setPrice(price_);
        _setLimits(minPayment_, maxPayment_);
        promoActive = true;

        _transferOwnership(owner_);
        _pause();
    }

    // ======= Покупка =======

    function buyWithReferral(uint256 paymentAmount, address referrer, uint256 minIbitiOut) external nonReentrant whenNotPaused {
        if (!promoActive) revert PromoInactive();
        if (promoEndTime != 0 && block.timestamp > promoEndTime) revert PromoEnded();
        if (paymentAmount < minPaymentAmount) revert AmountBelowMin(paymentAmount, minPaymentAmount);
        if (paymentAmount > maxPaymentAmount) revert AmountAboveMax(paymentAmount, maxPaymentAmount);

        (uint256 bought, uint256 bonus, ) = quoteTotalToBuyer(paymentAmount);
        if (bought == 0) revert ZeroAmount();
        if (bought < minIbitiOut) revert Slippage(bought, minIbitiOut);

        // Реферальная награда — один раз на покупателя
        uint256 ref;
        if (referrer != address(0) && referrer != msg.sender && !referralUsed[msg.sender]) {
            ref = refReward;
        }

        uint256 needed = bought + bonus + ref;
        uint256 inventory = ibitiToken.balanceOf(address(this));
        if (needed > inventory) revert InsufficientInventory(needed, inventory);

        soldTotal += bought;
        bonusSpent += bonus;
        if (ref != 0) {
            referralUsed[msg.sender] = true;
            refSpent += ref;
        }

        paymentToken.safeTransferFrom(msg.sender, reserveWallet, paymentAmount);
        ibitiToken.safeTransfer(msg.sender, bought + bonus);
        if (ref != 0) ibitiToken.safeTransfer(referrer, ref);

        emit PromoBuy(msg.sender, referrer, paymentAmount, bought, bonus, ref);
    }

    // ======= Чтение =======

    function quoteBoughtAmount(uint256 paymentAmount) public view returns (uint256) {
        return (paymentAmount * 10 ** IBITI_DECIMALS) / price;
    }

    function quoteTotalToBuyer(uint256 paymentAmount) public view returns (uint256 bought, uint256 bonus, uint256 total) {
        bought = quoteBoughtAmount(paymentAmount);
        bonus = (bought * bonusBps) / 10_000;
        total = bought + bonus;
    }

    /// @notice Реальный остаток IBITI на контракте.
    function poolRemaining() public view returns (uint256) {
        return ibitiToken.balanceOf(address(this));
    }

    /// @notice Всего запас = остаток + всё выданное; бонус и реферал — как их показывает сайт.
    function getStats() external view returns (uint256 bonusPoolTotal, uint256 bonusSpent_, uint256 refSpent_) {
        return (poolRemaining() + soldTotal + bonusSpent + refSpent, bonusSpent, refSpent);
    }

    // ======= Управление =======

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setPrice(uint256 newPrice) external onlyOwner whenPaused {
        _setPrice(newPrice);
    }

    function setBuyLimits(uint256 minPayment, uint256 maxPayment) external onlyOwner whenPaused {
        _setLimits(minPayment, maxPayment);
    }

    function setPromoActive(bool active) external onlyOwner {
        promoActive = active;
        emit PromoActiveUpdated(active);
    }

    function setPromoEndTime(uint256 endTime) external onlyOwner {
        promoEndTime = endTime;
        emit PromoEndTimeUpdated(endTime);
    }

    /// @notice Вернуть остаток IBITI можно только на паузе.
    function withdrawIbiti(address to, uint256 amount) external onlyOwner whenPaused {
        if (to == address(0)) revert ZeroAddress();
        ibitiToken.safeTransfer(to, amount);
        emit IbitiWithdrawn(to, amount);
    }

    /// @notice Чужие токены, присланные по ошибке. IBITI этим способом забрать нельзя.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(ibitiToken)) revert RescueIbitiForbidden();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, to, amount);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    function _setPrice(uint256 newPrice) private {
        if (newPrice < MIN_PRICE || newPrice > MAX_PRICE) revert PriceOutOfRange(newPrice);
        price = newPrice;
        emit PriceUpdated(newPrice);
    }

    function _setLimits(uint256 minPayment, uint256 maxPayment) private {
        if (minPayment == 0 || maxPayment < minPayment) revert BadLimits();
        minPaymentAmount = minPayment;
        maxPaymentAmount = maxPayment;
        emit BuyLimitsUpdated(minPayment, maxPayment);
    }
}
