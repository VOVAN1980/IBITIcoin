// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IIBITICollection {
    function mint(address to, uint256 cardId) external returns (uint256 tokenId);

    function cardCount() external view returns (uint256);

    function supplyOf(uint256 cardId) external view returns (uint256 minted, uint256 maxSupply);
}

/**
 * @title IBITINFTSale
 * @notice Продажа карточек коллекции за USDT. Покупка открыта всегда, пока карточка есть в тираже.
 *
 *         Цена карточки задаётся один раз и больше не меняется никогда: ни вверх, ни вниз, в том числе владельцем.
 *         Пока цена не задана, карточка не продаётся.
 *         USDT сразу уходит на reserveWallet и на контракте не лежит.
 *         Покупатель передаёт цену, которую видел: при другой цене покупка отклоняется и разрешение не остаётся.
 *
 *         Контракт создаётся на паузе.
 */
contract IBITINFTSale is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant PAYMENT_DECIMALS = 18;
    /// Защита от цены с неверными знаками: так нельзя выставить цену в копейки
    uint256 public constant MIN_PRICE = 1e18; // $1
    uint256 public constant MAX_PRICE = 1e24; // $1 000 000

    IERC20 public immutable paymentToken;
    IIBITICollection public immutable collection;
    address public immutable reserveWallet;

    mapping(uint256 => uint256) public priceOf;

    event Purchased(address indexed buyer, uint256 indexed cardId, uint256 indexed tokenId, uint256 price);
    event PriceSet(uint256 indexed cardId, uint256 price);
    event TokenRescued(address indexed token, uint256 amount);

    error ZeroAddress();
    error WrongDecimals(address token, uint8 decimals);
    error NotForSale(uint256 cardId);
    error PriceChanged(uint256 cardId, uint256 price);
    error PriceOutOfRange(uint256 price);
    error PriceLocked(uint256 cardId);
    error BadLength();
    error RenounceDisabled();

    constructor(address paymentToken_, address collection_, address owner_, address reserveWallet_) {
        if (paymentToken_ == address(0) || collection_ == address(0) || owner_ == address(0) || reserveWallet_ == address(0)) {
            revert ZeroAddress();
        }
        uint8 payDec = IERC20Metadata(paymentToken_).decimals();
        if (payDec != PAYMENT_DECIMALS) revert WrongDecimals(paymentToken_, payDec);

        paymentToken = IERC20(paymentToken_);
        collection = IIBITICollection(collection_);
        reserveWallet = reserveWallet_;

        _transferOwnership(owner_);
        _pause();
    }

    // ======= Покупка =======

    function buy(uint256 cardId, uint256 expectedPrice) external nonReentrant whenNotPaused returns (uint256 tokenId) {
        uint256 price = priceOf[cardId];
        if (price == 0) revert NotForSale(cardId);
        if (price != expectedPrice) revert PriceChanged(cardId, price);

        paymentToken.safeTransferFrom(msg.sender, reserveWallet, price);
        tokenId = collection.mint(msg.sender, cardId);
        emit Purchased(msg.sender, cardId, tokenId, price);
    }

    // ======= Чтение =======

    /// @notice Цены и тиражи всех карточек одним запросом. Индекс 0 — карточка 1.
    function catalog() external view returns (uint256[] memory prices, uint256[] memory minted, uint256[] memory maxSupply) {
        uint256 count = collection.cardCount();
        prices = new uint256[](count);
        minted = new uint256[](count);
        maxSupply = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            prices[i] = priceOf[i + 1];
            (minted[i], maxSupply[i]) = collection.supplyOf(i + 1);
        }
    }

    // ======= Управление =======

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Цена задаётся один раз и навсегда.
    function setPrices(uint256[] calldata cardIds, uint256[] calldata prices) external onlyOwner {
        if (cardIds.length == 0 || cardIds.length != prices.length) revert BadLength();
        for (uint256 i; i < cardIds.length; ++i) {
            uint256 price = prices[i];
            if (price < MIN_PRICE || price > MAX_PRICE) revert PriceOutOfRange(price);
            collection.supplyOf(cardIds[i]); // несуществующая карточка отклоняется
            if (priceOf[cardIds[i]] != 0) revert PriceLocked(cardIds[i]);
            priceOf[cardIds[i]] = price;
            emit PriceSet(cardIds[i], price);
        }
    }

    /// @notice Вернуть токены, присланные на контракт по ошибке. Уходят только на reserveWallet.
    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(reserveWallet, amount);
        emit TokenRescued(token, amount);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }
}
