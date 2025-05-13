// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./VolumeWeightedOracle.sol";
import "./NFTDiscount.sol";

/**
 * @title NFTSaleManager
 * @notice Менеджер продажи NFT за IBITI или USDT с автоматическим чеканингом в NFTDiscount.
 *         Оракул можно включать/выключать через setOracleEnabled.
 */
contract NFTSaleManager is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    NFTDiscount public nftDiscount;
    IERC20Metadata public ibitiToken;
    IERC20Metadata public usdtToken;
    VolumeWeightedOracle public priceOracle;

    /// @notice Флаг, разрешающий расчёт цены через оракул (IBITI-покупка)
    bool public oracleEnabled = true;

    // Цена каждого уровня скидки в центах USD (100 = $1.00).
    mapping(uint256 => uint256) public nftPriceUSD;

    event NFTPurchased(address indexed buyer, uint256 discountPercent, uint256 paidAmount, address paymentToken);
    event PriceSet(uint256 discountPercent, uint256 priceUSD);
    event OracleUpdated(address newOracle);
    event OracleToggled(bool enabled);

    constructor(
        address _nftDiscount,
        address _ibitiToken,
        address _usdtToken,
        address _priceOracle
    ) {
        require(_nftDiscount != address(0), "Invalid NFTDiscount");
        require(_ibitiToken != address(0), "Invalid IBITI token");
        require(_usdtToken != address(0), "Invalid USDT token");
        require(_priceOracle != address(0), "Invalid oracle");

        nftDiscount = NFTDiscount(_nftDiscount);
        ibitiToken = IERC20Metadata(_ibitiToken);
        usdtToken = IERC20Metadata(_usdtToken);
        priceOracle = VolumeWeightedOracle(_priceOracle);
        
    }

    /// @notice Экстренная остановка всех функций продажи и админских изменений.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Снятие остановки.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Включить или выключить IBITI-оракул.
    function setOracleEnabled(bool _on) external onlyOwner whenNotPaused {
        oracleEnabled = _on;
        emit OracleToggled(_on);
    }

    /// @notice Установить цену NFT за USD (цены в центах) для уровня скидки.
    function setNFTPrice(uint256 discountPercent, uint256 priceUSD)
        external
        onlyOwner
        whenNotPaused
    {
        nftPriceUSD[discountPercent] = priceUSD;
        emit PriceSet(discountPercent, priceUSD);
    }

    /// @notice Обновить адрес оракула.
    function updateOracle(address newOracle)
        external
        onlyOwner
        whenNotPaused
    {
        require(newOracle != address(0), "Invalid oracle");
        priceOracle = VolumeWeightedOracle(newOracle);
        emit OracleUpdated(newOracle);
    }

    /// @notice Купить NFT за IBITIcoin по рыночной цене.
    function buyNFTWithIBITI(uint256 discountPercent, string memory uri)
        external
        whenNotPaused
        nonReentrant
    {
        require(oracleEnabled, "Oracle disabled");
        uint256 priceUSD = nftPriceUSD[discountPercent];
        require(priceUSD > 0, "Price not set");

        uint256 currentPrice;
        try priceOracle.getPrice() returns (uint256 p) {
            currentPrice = p;
        } catch {
            revert("Invalid IBITI price");
        }
        require(currentPrice > 0, "Invalid IBITI price");

        // Рассчитываем сумму IBITI: (priceUSD * 10^14) / currentPrice
        uint256 ibitiAmount = (priceUSD * (10 ** 14)) / currentPrice;
        ibitiToken.safeTransferFrom(msg.sender, owner(), ibitiAmount);

        // Минтим NFT
        nftDiscount.mint(msg.sender, discountPercent, uri);

        emit NFTPurchased(msg.sender, discountPercent, ibitiAmount, address(ibitiToken));
    }

    /// @notice Купить NFT за USDT по фиксированной цене.
    function buyNFTWithUSDT(uint256 discountPercent, string memory uri)
        external
        whenNotPaused
        nonReentrant
    {
        uint256 priceUSD = nftPriceUSD[discountPercent];
        require(priceUSD > 0, "Price not set");

        uint8 dec = usdtToken.decimals();
        uint256 usdtAmount = priceUSD * (10 ** (dec - 2));
        usdtToken.safeTransferFrom(msg.sender, owner(), usdtAmount);

        // Минтим NFT
        nftDiscount.mint(msg.sender, discountPercent, uri);

        emit NFTPurchased(msg.sender, discountPercent, usdtAmount, address(usdtToken));
    }

    /// @notice Текущая цена NFT в IBITIcoin (view).
    function getCurrentIBITIPrice(uint256 discountPercent) external view returns (uint256) {
        require(oracleEnabled, "Oracle disabled");
        uint256 priceUSD = nftPriceUSD[discountPercent];
        require(priceUSD > 0, "Price not set");

        uint256 currentPrice;
        try priceOracle.getPrice() returns (uint256 p) {
            currentPrice = p;
        } catch {
            revert("Invalid IBITI price");
        }
        require(currentPrice > 0, "Invalid IBITI price");

        return (priceUSD * (10 ** 14)) / currentPrice;
    }

    /// @notice Текущая цена NFT в USDT (view).
    function getCurrentUSDTPrice(uint256 discountPercent) external view returns (uint256) {
        uint256 priceUSD = nftPriceUSD[discountPercent];
        require(priceUSD > 0, "Price not set");

        uint8 dec = usdtToken.decimals();
        return priceUSD * (10 ** (dec - 2));
    }
}

