// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Интерфейс для IBITIcoin (ERC20)
interface IIBITIcoin {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @notice Интерфейс для USDT‑подобных ERC20
interface IERC20Extended {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/**
 * @title IBITINFT
 * @notice ERC721 NFT, покупаемые за IBITIcoin или USDT.
 */
contract IBITINFT is ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    using Strings for uint256;

    uint256 public nftPrice;              // цена в IBITI
    uint256 public nftPriceUSDT;          // цена в USDT
    uint256 public priceUpdateInterval = 30 days;
    uint256 public priceGrowthRate;       // в basis points (100 = 1%)
    uint256 public lastPriceUpdate;
    uint256 public totalNFTPurchasesThisMonth;
    uint256 public salesThreshold;        // порог продаж

    IIBITIcoin     public ibitiToken;
    IERC20Extended public usdtToken;

    mapping(string => bool) public mintedURIs;
    uint256 public nextTokenId;

    event NFTPurchased(address indexed buyer, uint256 tokenId, uint256 price, address paymentToken);
    event PriceParametersUpdated(uint256 newPrice, uint256 timestamp);
    event NFTUpdated(uint256 oldTokenId, uint256 newTokenId, string newURI);

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _nftPrice,
        uint256 _nftPriceUSDT,
        uint256 _priceGrowthRate,
        uint256 _salesThreshold,
        address _ibitiToken
    ) ERC721(_name, _symbol) {
        require(_ibitiToken != address(0), "Invalid IBITI token");
        nftPrice        = _nftPrice;
        nftPriceUSDT    = _nftPriceUSDT;
        priceGrowthRate = _priceGrowthRate;
        salesThreshold  = _salesThreshold;
        lastPriceUpdate = block.timestamp;
        ibitiToken      = IIBITIcoin(_ibitiToken);
    }

    /// @notice Поставить контракт на паузу
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Снять паузу
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Задать параметры USDT (адрес и цену)
    function setUSDTParameters(address _usdtToken, uint256 _nftPriceUSDT) external onlyOwner whenNotPaused {
        require(_usdtToken != address(0), "Invalid USDT token");
        usdtToken    = IERC20Extended(_usdtToken);
        nftPriceUSDT = _nftPriceUSDT;
    }

    /// @notice Покупка за IBITIcoin
    function purchaseNFT(string memory tokenURI) external nonReentrant whenNotPaused {
        require(bytes(tokenURI).length > 0, "Empty tokenURI");
        require(!mintedURIs[tokenURI], "URI already used");

        uint256 price = nftPrice;
        bool success;

        try ibitiToken.transferFrom(msg.sender, owner(), price) returns (bool ok) {
            success = ok;
        } catch {
            revert("Payment failed");
        }
        require(success, "Payment failed");

        uint256 tokenId = nextTokenId++;
        _mint(msg.sender, tokenId);
        _setTokenURI(tokenId, _convertToHttps(tokenURI));
        mintedURIs[tokenURI] = true;
        totalNFTPurchasesThisMonth++;

        emit NFTPurchased(msg.sender, tokenId, price, address(ibitiToken));
    }

    /// @notice Покупка за USDT
    function purchaseNFTWithUSDT(string memory tokenURI) external nonReentrant whenNotPaused {
        require(bytes(tokenURI).length > 0, "Empty tokenURI");
        require(!mintedURIs[tokenURI], "URI already used");
        require(address(usdtToken) != address(0), "USDT token not set");

        uint256 price = nftPriceUSDT;
        bool success;
        try usdtToken.transferFrom(msg.sender, owner(), price) returns (bool ok) {
            success = ok;
        } catch {
            revert("Payment failed");
        }
        require(success, "Payment failed");

        uint256 tokenId = nextTokenId++;
        _mint(msg.sender, tokenId);
        _setTokenURI(tokenId, _convertToHttps(tokenURI));
        mintedURIs[tokenURI] = true;
        totalNFTPurchasesThisMonth++;

        emit NFTPurchased(msg.sender, tokenId, price, address(usdtToken));
    }

    /// @notice Ежемесячное обновление цены
    function updateNFTPriceMonthly() external onlyOwner whenNotPaused {
        require(block.timestamp >= lastPriceUpdate + priceUpdateInterval, "Update not allowed yet");
        require(salesThreshold > 0, "Sales threshold not set");

        if (totalNFTPurchasesThisMonth >= salesThreshold) {
            nftPrice = (nftPrice * (10000 + priceGrowthRate)) / 10000;
        }
        lastPriceUpdate = block.timestamp;
        totalNFTPurchasesThisMonth = 0;
        emit PriceParametersUpdated(nftPrice, block.timestamp);
    }

    /// @notice Burn & mint для обновления URI
    function updateNFT(uint256 tokenId, string memory newTokenURI) external onlyOwner whenNotPaused {
        address ownerNFT = ownerOf(tokenId);
        require(ownerNFT != address(0), "Invalid token");
        require(!mintedURIs[newTokenURI], "New URI already used");

        _burn(tokenId);
        uint256 newTokenId = nextTokenId++;
        _mint(ownerNFT, newTokenId);
        _setTokenURI(newTokenId, _convertToHttps(newTokenURI));
        mintedURIs[newTokenURI] = true;

        emit NFTUpdated(tokenId, newTokenId, _convertToHttps(newTokenURI));
    }

    /// @notice ipfs:// → https://dweb.link/ipfs/
    function _convertToHttps(string memory uri) internal pure returns (string memory) {
        bytes memory b = bytes(uri);
        if (b.length < 7) return uri;
        bytes memory prefix = bytes("ipfs://");
        for (uint i = 0; i < 7; i++) {
            if (b[i] != prefix[i]) return uri;
        }
        bytes memory cid = new bytes(b.length - 7);
        for (uint i = 7; i < b.length; i++) {
            cid[i - 7] = b[i];
        }
        return string(abi.encodePacked("https://dweb.link/ipfs/", cid));
    }
}
