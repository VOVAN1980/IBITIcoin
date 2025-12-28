// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IUniswapV2PairLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 r0, uint112 r1, uint32);
}

/**
 * @title IBITIReferralPromoRouterCashUUPS
 * @notice Полностью настраиваемый "cash-sale" роутер (без swap):
 * - покупатель платит USDT -> контракт мгновенно пересылает USDT на reserveWallet
 * - количество IBITI считается по резервам пары (как swap-quote) + бонус
 * - IBITI выдаётся из баланса контракта
 * - рефереру +refReward (обычно 1 IBITI) один раз на buyer->referrer
 * - статистика пула ивенты и сигнатуры совместимы со старым контрактом
 *
 * Upgradeable (UUPS): адрес Proxy для сайта постоянный.
 */
contract IBITIReferralPromoRouterCashUUPS is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // ======= совместимые поля со "старым" контрактом =======
    IERC20Upgradeable public paymentToken; // USDT
    IERC20Upgradeable public ibitiToken;   // IBITI

    // router раньше был immutable и использовался для swap.
    // Здесь router не нужен, но чтобы НЕ ломать фронт/ABI, оставляем переменную-адрес "routerLike".
    address public routerLike;

    // swapPath тоже оставляем для совместимости (фронт может читать/писать), но логика продажи его не использует.
    address[] public swapPath;

    uint256 public bonusBps;
    uint256 public refReward;
    uint256 public minPaymentAmount;

    bool public promoActive;
    uint256 public promoEndTime;

    uint256 public bonusPoolTotal;
    uint256 public bonusSpent;
    uint256 public refSpent;

    mapping(address => mapping(address => bool)) public referralCredited;

    // ======= новые гибкие настройки =======
    address public reserveWallet;

    IUniswapV2PairLike public pair;

    // ограничение покупки (можно менять). 0 = без лимита.
    uint256 public maxPaymentAmount;

    // режим расчёта boughtAmount:
    // 0 = AMM quote (как swap) с feeBps
    // 1 = SPOT (payment/ibiti по ratio резервов, без slippage) — НЕ рекомендую, но пусть будет
    uint8 public quoteMode;

    // комиссия AMM (Pancake v2 примерно 25 bps = 0.25%)
    uint256 public feeBps;

    // защита от манипуляции ценой: spot price (payment units per 1 IBITI-unit)
    uint256 public minSpotPrice; // 0 = выключено
    uint256 public maxSpotPrice; // 0 = выключено

    // чтобы можно было "крутить всё", но безопасно: критические изменения только в PAUSE
    bool public requirePauseForCritical; // true по умолчанию

    // ======= события (как в старом) =======
    event PromoParamsUpdated(
        uint256 bonusBps,
        uint256 refReward,
        uint256 minPaymentAmount,
        bool promoActive,
        uint256 promoEndTime
    );

    event SwapPathUpdated(address[] newPath);

    event BonusPoolFunded(uint256 amount, uint256 newTotal);
    event BonusPoolAdjusted(uint256 newTotal);

    event PromoBuy(
        address indexed buyer,
        address indexed referrer,
        uint256 paymentAmount,
        uint256 boughtAmount,
        uint256 bonusAmount,
        uint256 refAmount
    );

    event WithdrawIBITI(address indexed to, uint256 amount);
    event WithdrawPaymentToken(address indexed to, uint256 amount);

    // ======= дополнительные события =======
    event ReserveWalletUpdated(address indexed newReserveWallet);
    event PairUpdated(address indexed newPair);
    event TokensUpdated(address indexed paymentToken, address indexed ibitiToken);
    event RouterLikeUpdated(address indexed newRouterLike);
    event QuoteConfigUpdated(uint8 quoteMode, uint256 feeBps);
    event BuyLimitsUpdated(uint256 minAmount, uint256 maxAmount);
    event SpotPriceBoundsUpdated(uint256 minSpotPrice, uint256 maxSpotPrice);
    event CriticalPolicyUpdated(bool requirePauseForCritical);

    // ======= init =======
    function initialize(
        address _paymentToken,
        address _ibitiToken,
        address _pair,
        address _reserveWallet,
        address _routerLike,
        address[] calldata _swapPath,
        uint256 _bonusBps,
        uint256 _refReward,
        uint256 _minPayment,
        uint256 _maxPayment,
        uint256 _promoEndTime
    ) external initializer {
        require(_paymentToken != address(0), "Zero payment token");
        require(_ibitiToken != address(0), "Zero IBITI token");
        require(_pair != address(0), "Zero pair");
        require(_reserveWallet != address(0), "Zero reserve");

        __Ownable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        paymentToken = IERC20Upgradeable(_paymentToken);
        ibitiToken   = IERC20Upgradeable(_ibitiToken);

        pair = IUniswapV2PairLike(_pair);
        _validatePairTokens(_pair, _paymentToken, _ibitiToken);

        reserveWallet = _reserveWallet;

        routerLike = _routerLike; // для совместимости
        swapPath = _swapPath;     // для совместимости (можешь оставить [USDT, IBITI])

        bonusBps = _bonusBps;
        refReward = _refReward;
        minPaymentAmount = _minPayment;
        maxPaymentAmount = _maxPayment;

        promoEndTime = _promoEndTime;
        promoActive = true;

        // дефолты
        quoteMode = 0;
        feeBps = 25; // Pancake v2 ~0.25%
        requirePauseForCritical = true;

        emit RouterLikeUpdated(_routerLike);
        emit SwapPathUpdated(_swapPath);
        emit PromoParamsUpdated(_bonusBps, _refReward, _minPayment, promoActive, _promoEndTime);
        emit ReserveWalletUpdated(_reserveWallet);
        emit PairUpdated(_pair);
        emit QuoteConfigUpdated(quoteMode, feeBps);
        emit BuyLimitsUpdated(_minPayment, _maxPayment);
        emit CriticalPolicyUpdated(true);
    }

    // UUPS auth
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ======= view-статистика (как в старом) =======
    function poolRemaining() public view returns (uint256) {
        uint256 spent = bonusSpent + refSpent;
        if (bonusPoolTotal <= spent) return 0;
        return bonusPoolTotal - spent;
    }

    function totalSpentFromPool() public view returns (uint256) {
        return bonusSpent + refSpent;
    }

    function poolProgressBps() external view returns (uint256) {
        if (bonusPoolTotal == 0) return 0;
        return (totalSpentFromPool() * 10_000) / bonusPoolTotal;
    }

    function getStats()
        external
        view
        returns (uint256 _poolTotal, uint256 _bonusSpent, uint256 _refSpent, uint256 _remaining)
    {
        _poolTotal = bonusPoolTotal;
        _bonusSpent = bonusSpent;
        _refSpent = refSpent;
        _remaining = poolRemaining();
    }

    // ======= Параметры промо (как в старом) =======
    function setPromoParams(
        uint256 _bonusBps,
        uint256 _refReward,
        uint256 _minPaymentAmount,
        bool _promoActive,
        uint256 _promoEndTime
    ) external onlyOwner {
        bonusBps = _bonusBps;
        refReward = _refReward;
        minPaymentAmount = _minPaymentAmount;
        promoActive = _promoActive;
        promoEndTime = _promoEndTime;

        emit PromoParamsUpdated(_bonusBps, _refReward, _minPaymentAmount, _promoActive, _promoEndTime);
        emit BuyLimitsUpdated(_minPaymentAmount, maxPaymentAmount);
    }

    function setPromoActive(bool _active) external onlyOwner {
        promoActive = _active;
        emit PromoParamsUpdated(bonusBps, refReward, minPaymentAmount, _active, promoEndTime);
    }

    function setPromoEndTime(uint256 _promoEndTime) external onlyOwner {
        promoEndTime = _promoEndTime;
        emit PromoParamsUpdated(bonusBps, refReward, minPaymentAmount, promoActive, _promoEndTime);
    }

    function setSwapPath(address[] calldata _swapPath) external onlyOwner {
        // оставляем проверки как в старом, чтобы фронт не сломался
        require(_swapPath.length >= 2, "Path too short");
        require(_swapPath[0] == address(paymentToken), "Path[0] must be paymentToken");
        require(_swapPath[_swapPath.length - 1] == address(ibitiToken), "Path[last] must be IBITI");
        swapPath = _swapPath;
        emit SwapPathUpdated(_swapPath);
    }

    function fundBonusPool(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        ibitiToken.safeTransferFrom(msg.sender, address(this), amount);
        bonusPoolTotal += amount;
        emit BonusPoolFunded(amount, bonusPoolTotal);
    }

    function adjustBonusPoolTotal(uint256 newTotal) external onlyOwner {
        bonusPoolTotal = newTotal;
        emit BonusPoolAdjusted(newTotal);
    }

    // ======= новые сеттеры (полная гибкость) =======
    function setReserveWallet(address _reserveWallet) external onlyOwner {
        require(_reserveWallet != address(0), "Zero reserve");
        reserveWallet = _reserveWallet;
        emit ReserveWalletUpdated(_reserveWallet);
    }

    function setBuyLimits(uint256 _minPayment, uint256 _maxPayment) external onlyOwner {
        minPaymentAmount = _minPayment;
        maxPaymentAmount = _maxPayment;
        emit BuyLimitsUpdated(_minPayment, _maxPayment);
    }

    function setQuoteConfig(uint8 _quoteMode, uint256 _feeBps) external onlyOwner {
        require(_quoteMode <= 1, "bad mode");
        require(_feeBps <= 100, "fee too high"); // 1% cap
        quoteMode = _quoteMode;
        feeBps = _feeBps;
        emit QuoteConfigUpdated(_quoteMode, _feeBps);
    }

    function setSpotPriceBounds(uint256 _minSpotPrice, uint256 _maxSpotPrice) external onlyOwner {
        require(_maxSpotPrice == 0 || _maxSpotPrice >= _minSpotPrice, "bounds");
        minSpotPrice = _minSpotPrice;
        maxSpotPrice = _maxSpotPrice;
        emit SpotPriceBoundsUpdated(_minSpotPrice, _maxSpotPrice);
    }

    function setRequirePauseForCritical(bool v) external onlyOwner {
        requirePauseForCritical = v;
        emit CriticalPolicyUpdated(v);
    }

    function setRouterLike(address _routerLike) external onlyOwner {
        routerLike = _routerLike;
        emit RouterLikeUpdated(_routerLike);
    }

    function setPair(address _pair) external onlyOwner {
        if (requirePauseForCritical) require(paused(), "pause required");
        require(_pair != address(0), "Zero pair");

        // pair must match current tokens
        _validatePairTokens(_pair, address(paymentToken), address(ibitiToken));
        pair = IUniswapV2PairLike(_pair);

        emit PairUpdated(_pair);
    }

    function setTokens(address _paymentToken, address _ibitiToken) external onlyOwner {
        if (requirePauseForCritical) require(paused(), "pause required");
        require(_paymentToken != address(0) && _ibitiToken != address(0), "zero");
        paymentToken = IERC20Upgradeable(_paymentToken);
        ibitiToken   = IERC20Upgradeable(_ibitiToken);

        // также валидируем текущую пару под новые токены (если пара задана)
        address p = address(pair);
        if (p != address(0)) {
            _validatePairTokens(p, _paymentToken, _ibitiToken);
        }
        emit TokensUpdated(_paymentToken, _ibitiToken);
    }

    // ======= pause/unpause (как в старом) =======
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ======= Квоты (для фронта/слиппеджа) =======
    function getSpotPrice() public view returns (uint256 price) {
        (uint256 ibRes, uint256 payRes) = _reserves();
        uint8 ibDec = IERC20MetadataUpgradeable(address(ibitiToken)).decimals();
        price = (payRes * (10 ** ibDec)) / ibRes; // payment units per 1 IBITI-unit
    }

    function quoteBoughtAmount(uint256 paymentAmount) public view returns (uint256 boughtAmount) {
        if (quoteMode == 1) {
            // SPOT: bought = payment / price
            uint256 price = getSpotPrice();
            require(price > 0, "price 0");
            uint8 ibDec = IERC20MetadataUpgradeable(address(ibitiToken)).decimals();
            // paymentAmount * 10^ibDec / price
            boughtAmount = (paymentAmount * (10 ** ibDec)) / price;
            return boughtAmount;
        }

        // AMM: amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee)
        (uint256 ibRes, uint256 payRes) = _reserves();

        uint256 amountInWithFee = paymentAmount * (10_000 - feeBps);
        uint256 numerator = amountInWithFee * ibRes;
        uint256 denominator = (payRes * 10_000) + amountInWithFee;
        boughtAmount = numerator / denominator;
    }

    function quoteTotalToBuyer(uint256 paymentAmount)
        external
        view
        returns (uint256 boughtAmount, uint256 bonusAmount, uint256 totalToBuyer)
    {
        boughtAmount = quoteBoughtAmount(paymentAmount);
        bonusAmount = (boughtAmount * bonusBps) / 10_000;
        totalToBuyer = boughtAmount + bonusAmount;
    }

    // ======= Покупка (сигнатура как в старом) =======
    function buyWithReferral(
        uint256 paymentAmount,
        address referrer,
        uint256 minIbitiOut
    ) external nonReentrant whenNotPaused {
        require(promoActive, "Promo inactive");
        if (promoEndTime != 0) require(block.timestamp <= promoEndTime, "Promo ended");
        require(paymentAmount >= minPaymentAmount, "Amount < min");
        if (maxPaymentAmount != 0) require(paymentAmount <= maxPaymentAmount, "Amount > max");

        // забираем paymentToken у покупателя
        paymentToken.safeTransferFrom(msg.sender, address(this), paymentAmount);

        // сразу отправляем всё на резерв
        paymentToken.safeTransfer(reserveWallet, paymentAmount);

        // защита от манипуляции: spot price bounds (если включены)
        uint256 spot = getSpotPrice();
        if (minSpotPrice != 0) require(spot >= minSpotPrice, "spot too low");
        if (maxSpotPrice != 0) require(spot <= maxSpotPrice, "spot too high");

        // "сколько бы купили" на Pancake
        uint256 boughtAmount = quoteBoughtAmount(paymentAmount);
        require(boughtAmount >= minIbitiOut, "slippage");

        uint256 bonusAmount = (boughtAmount * bonusBps) / 10_000;

        uint256 refAmount = 0;
        if (referrer != address(0) && referrer != msg.sender && !referralCredited[msg.sender][referrer]) {
            refAmount = refReward;
        }

        uint256 needFromPool = bonusAmount + refAmount;
        require(needFromPool > 0, "Nothing to pay");
        require(poolRemaining() >= needFromPool, "Pool exhausted");

        // у контракта должен быть инвентарь: base + bonus + ref
        uint256 needInventory = boughtAmount + bonusAmount + refAmount;
        require(IERC20Upgradeable(ibitiToken).balanceOf(address(this)) >= needInventory, "IBITI low");

        // выплата покупателю: base + bonus
        ibitiToken.safeTransfer(msg.sender, boughtAmount + bonusAmount);
        bonusSpent += bonusAmount;

        // выплата рефереру
        if (refAmount > 0) {
            ibitiToken.safeTransfer(referrer, refAmount);
            refSpent += refAmount;
            referralCredited[msg.sender][referrer] = true;
        }

        emit PromoBuy(msg.sender, referrer, paymentAmount, boughtAmount, bonusAmount, refAmount);
    }

    // ======= выводы/спасение (как в старом + rescue) =======
    function withdrawExtraIBITI(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 balance = ibitiToken.balanceOf(address(this));
        uint256 locked = promoActive ? poolRemaining() : 0;

        require(balance > locked, "Nothing extra");
        require(amount <= balance - locked, "Amount > extra");

        ibitiToken.safeTransfer(to, amount);
        emit WithdrawIBITI(to, amount);
    }

    function withdrawAllIBITI(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        require(!promoActive || (promoEndTime != 0 && block.timestamp > promoEndTime) || poolRemaining() == 0, "Promo still active");

        uint256 balance = ibitiToken.balanceOf(address(this));
        ibitiToken.safeTransfer(to, balance);
        emit WithdrawIBITI(to, balance);
    }

    function withdrawPaymentToken(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 balance = paymentToken.balanceOf(address(this));
        require(amount <= balance, "Amount > balance");

        paymentToken.safeTransfer(to, amount);
        emit WithdrawPaymentToken(to, amount);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(paymentToken) && token != address(ibitiToken), "no");
        IERC20Upgradeable(token).safeTransfer(to, amount);
    }

    // ======= internal helpers =======
    function _validatePairTokens(address _pair, address _paymentToken, address _ibitiToken) internal view {
        IUniswapV2PairLike p = IUniswapV2PairLike(_pair);
        address t0 = p.token0();
        address t1 = p.token1();
        require(
            (t0 == _ibitiToken && t1 == _paymentToken) ||
            (t1 == _ibitiToken && t0 == _paymentToken),
            "pair mismatch"
        );
    }

    function _reserves() internal view returns (uint256 ibRes, uint256 payRes) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        address t0 = pair.token0();
        if (t0 == address(ibitiToken)) {
            ibRes = uint256(r0);
            payRes = uint256(r1);
        } else {
            ibRes = uint256(r1);
            payRes = uint256(r0);
        }
        require(ibRes > 0 && payRes > 0, "empty reserves");
    }
}
