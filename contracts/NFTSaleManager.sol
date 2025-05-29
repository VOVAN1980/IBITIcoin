// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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

    /// @notice Контракт-эмитент NFT-дисконтов
    NFTDiscount public nftDiscount;
    /// @notice Токен IBITI для оплаты
    IERC20Metadata public ibitiToken;
    /// @notice Токен USDT для оплаты
    IERC20Metadata public usdtToken;
    /// @notice Оракул цены IBITI
    VolumeWeightedOracle public priceOracle;

    /// @notice Флаг, разрешающий расчёт цены через оракул (IBITI-покупка)
    bool public oracleEnabled = true;

    /// @notice Цена каждого уровня скидки в центах USD (ключ — discountPercent)
    mapping(uint256 => uint256) public nftPriceUSD;
    /// @notice Отдельная цена в центах USD для Pandora (100%)
    uint256 public pandoraPriceUSD;

    event NFTPurchased(address indexed buyer, uint256 discountPercent, uint256 paidAmount, address paymentToken);
    event PriceSet(uint256 discountPercent, uint256 priceUSD);
    event PandoraPriceSet(uint256 priceUSD);
    event OracleUpdated(address newOracle);
    event OracleToggled(bool enabled);

    /**
     * @param _nftDiscount    адрес контракта NFTDiscount
     * @param _ibitiToken     адрес IBITI-токена
     * @param _usdtToken      адрес USDT-токена
     * @param _priceOracle    адрес оракула цены IBITI
     */
    constructor(
        address _nftDiscount,
        address _ibitiToken,
        address _usdtToken,
        address _priceOracle
    ) {
        require(_nftDiscount != address(0), "Invalid NFTDiscount");
        require(_ibitiToken   != address(0), "Invalid IBITI token");
        require(_usdtToken    != address(0), "Invalid USDT token");
        require(_priceOracle  != address(0), "Invalid oracle");

        nftDiscount  = NFTDiscount(_nftDiscount);
        ibitiToken   = IERC20Metadata(_ibitiToken);
        usdtToken    = IERC20Metadata(_usdtToken);
        priceOracle  = VolumeWeightedOracle(_priceOracle);
    }

    /// @notice Останавливает функции продажи
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Снимает остановку функций продажи
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Включает или выключает использование оракула
    function setOracleEnabled(bool _on) external onlyOwner whenNotPaused {
        oracleEnabled = _on;
        emit OracleToggled(_on);
    }

    /// @notice Устанавливает цену в центах USD для любого discountPercent (Epic и ниже)
    function setNFTPrice(uint256 discountPercent, uint256 priceUSD)
        external
        onlyOwner
        whenNotPaused
    {
        nftPriceUSD[discountPercent] = priceUSD;
        emit PriceSet(discountPercent, priceUSD);
    }

    /// @notice Устанавливает отдельную цену Pandora в центах USD
    function setPandoraPrice(uint256 priceUSD)
        external
        onlyOwner
        whenNotPaused
    {
        pandoraPriceUSD = priceUSD;
        emit PandoraPriceSet(priceUSD);
    }

    /// @notice Обновляет адрес оракула цены IBITI
    function updateOracle(address newOracle)
        external
        onlyOwner
        whenNotPaused
    {
        require(newOracle != address(0), "Invalid oracle");
        priceOracle = VolumeWeightedOracle(newOracle);
        emit OracleUpdated(newOracle);
    }

    /**
     * @notice Купить любой NFT за IBITIcoin (Epic и ниже)
     * @param discountPercent  уровень скидки (1,3,5,7,10,15,25,50,75,100)
     * @param uri              metadata URI для чеканки
     */
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

        uint256 ibitiAmount = (priceUSD * 1e14) / currentPrice;
        ibitiToken.safeTransferFrom(msg.sender, owner(), ibitiAmount);

        // Минтим Epic или низшие уровни
        nftDiscount.mint(msg.sender, discountPercent, uri);

        emit NFTPurchased(msg.sender, discountPercent, ibitiAmount, address(ibitiToken));
    }

    /**
     * @notice Купить любой NFT за USDT (Epic и ниже)
     * @param discountPercent  уровень скидки (1,3,5,7,10,15,25,50,75,100)
     * @param uri              metadata URI для чеканки
     */
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

        // Минтим Epic или низшие уровни
        nftDiscount.mint(msg.sender, discountPercent, uri);

        emit NFTPurchased(msg.sender, discountPercent, usdtAmount, address(usdtToken));
    }

    /**
     * @notice Купить Pandora за IBITIcoin
     * @param uri  metadata URI для Pandora
     */
    function buyPandoraWithIBITI(string calldata uri)
        external
        whenNotPaused
        nonReentrant
    {
        require(oracleEnabled, "Oracle disabled");
        require(pandoraPriceUSD > 0, "Pandora price not set");

        uint256 currentPrice;
        try priceOracle.getPrice() returns (uint256 p) {
            currentPrice = p;
        } catch {
            revert("Invalid IBITI price");
        }
        require(currentPrice > 0, "Invalid IBITI price");

        uint256 ibitiAmount = (pandoraPriceUSD * 1e14) / currentPrice;
        ibitiToken.safeTransferFrom(msg.sender, owner(), ibitiAmount);

        // Минтим исключительно Pandora
        nftDiscount.mintPandora(msg.sender, uri);

        emit NFTPurchased(msg.sender, 100, ibitiAmount, address(ibitiToken));
    }

    /**
     * @notice Купить Pandora за USDT
     * @param uri  metadata URI для Pandora
     */
    function buyPandoraWithUSDT(string calldata uri)
        external
        whenNotPaused
        nonReentrant
    {
        require(pandoraPriceUSD > 0, "Pandora price not set");

        uint8 dec = usdtToken.decimals();
        uint256 usdtAmount = pandoraPriceUSD * (10 ** (dec - 2));
        usdtToken.safeTransferFrom(msg.sender, owner(), usdtAmount);

        // Минтим исключительно Pandora
        nftDiscount.mintPandora(msg.sender, uri);

        emit NFTPurchased(msg.sender, 100, usdtAmount, address(usdtToken));
    }

    /**
     * @notice Получить текущую цену любого NFT в IBITIcoin
     * @param discountPercent  уровень скидки
     * @return сумма в IBITI
     */
    function getCurrentIBITIPrice(uint256 discountPercent)
        external
        view
        returns (uint256)
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

        return (priceUSD * 1e14) / currentPrice;
    }

    /**
     * @notice Получить текущую цену любого NFT в USDT
     * @param discountPercent  уровень скидки
     * @return сумма в USDT
     */
    function getCurrentUSDTPrice(uint256 discountPercent)
        external
        view
        returns (uint256)
    {
        uint256 priceUSD = nftPriceUSD[discountPercent];
        require(priceUSD > 0, "Price not set");

        uint8 dec = usdtToken.decimals();
        return priceUSD * (10 ** (dec - 2));
    }
}
