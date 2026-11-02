// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title IBITICollection
 * @notice Коллекция NFT «Путь Человечества». NFT остаётся у хозяина навсегда: срока нет, сжечь его нельзя,
 *         владелец контракта не может его забрать, передать или остановить передачу. Функции сжигания и паузы нет.
 *
 *         Карточки: у каждой свой тираж. Тираж можно только снизить, поднять его нельзя.
 *         Всего карточек не больше MAX_CARDS: 11 и полная коллекция с книгой.
 *
 *         Выпускает только контракт продажи. Он назначается один раз и навсегда: обычный кошелёк назначить нельзя,
 *         а пока продажа не назначена, выпуск закрыт. Другого способа выпустить карточку в контракте нет.
 *
 *         Процент с перепродаж (ERC-2981): на старте 5%, владелец может менять его не выше 10%.
 *         Удерживает площадка, если она это поддерживает; передачи контракт не ограничивает.
 */
contract IBITICollection is ERC721Enumerable, ERC2981, Ownable2Step {
    struct Card {
        string uri;
        uint64 maxSupply;
        uint64 minted;
        bool uriFrozen;
    }

    uint96 public constant INITIAL_ROYALTY_BPS = 500; // 5%
    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10%
    uint256 public constant MAX_CARDS = 12;

    mapping(uint256 => Card) private _cards;
    uint256 public cardCount;

    /// Какая карточка у NFT
    mapping(uint256 => uint256) public cardOf;

    /// Контракт продажи: единственный, кто выпускает карточки
    address public seller;
    uint256 public lastTokenId;

    event CardAdded(uint256 indexed cardId, uint256 maxSupply, string uri);
    event MaxSupplyLowered(uint256 indexed cardId, uint256 maxSupply);
    event CardURISet(uint256 indexed cardId, string uri);
    event CardURIFrozen(uint256 indexed cardId);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 indexed cardId);
    event SellerSet(address indexed seller);
    event RoyaltySet(address indexed receiver, uint96 bps);

    error ZeroAddress();
    error NotSeller(address account);
    error UnknownCard(uint256 cardId);
    error SoldOut(uint256 cardId);
    error BadLength();
    error BadMaxSupply(uint256 maxSupply);
    error TooManyCards();
    error SellerAlreadySet();
    error NotAContract(address account);
    error URIFrozen(uint256 cardId);
    error RoyaltyTooHigh(uint96 bps);
    error RenounceDisabled();

    constructor(address owner_, address royaltyReceiver_) ERC721("IBITI The Path of Humanity", "IBITINFT") {
        if (owner_ == address(0) || royaltyReceiver_ == address(0)) revert ZeroAddress();
        _setDefaultRoyalty(royaltyReceiver_, INITIAL_ROYALTY_BPS);
        emit RoyaltySet(royaltyReceiver_, INITIAL_ROYALTY_BPS);
        _transferOwnership(owner_);
    }

    // ======= Выпуск =======

    /// @notice Карточка коллекции. Выпускает контракт продажи.
    function mint(address to, uint256 cardId) external returns (uint256 tokenId) {
        if (msg.sender != seller) revert NotSeller(msg.sender);
        _requireCard(cardId);
        Card storage c = _cards[cardId];
        if (c.minted >= c.maxSupply) revert SoldOut(cardId);
        c.minted += 1;

        tokenId = ++lastTokenId;
        cardOf[tokenId] = cardId;
        _mint(to, tokenId);
        emit Minted(to, tokenId, cardId);
    }

    // ======= Чтение =======

    function cardInfo(uint256 cardId) external view returns (Card memory) {
        _requireCard(cardId);
        return _cards[cardId];
    }

    function supplyOf(uint256 cardId) external view returns (uint256 minted, uint256 maxSupply) {
        _requireCard(cardId);
        Card storage c = _cards[cardId];
        return (c.minted, c.maxSupply);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        return _cards[cardOf[tokenId]].uri;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ======= Управление =======

    function addCards(string[] calldata uris, uint64[] calldata maxSupplies) external onlyOwner {
        if (uris.length == 0 || uris.length != maxSupplies.length) revert BadLength();
        for (uint256 i; i < uris.length; ++i) {
            if (maxSupplies[i] == 0) revert BadMaxSupply(0);
            uint256 cardId = ++cardCount;
            _cards[cardId] = Card({uri: uris[i], maxSupply: maxSupplies[i], minted: 0, uriFrozen: false});
            emit CardAdded(cardId, maxSupplies[i], uris[i]);
        }
        if (cardCount > MAX_CARDS) revert TooManyCards();
    }

    /// @notice Тираж только вниз и не ниже уже выпущенного.
    function lowerMaxSupply(uint256 cardId, uint64 maxSupply) external onlyOwner {
        _requireCard(cardId);
        Card storage c = _cards[cardId];
        if (maxSupply >= c.maxSupply || maxSupply < c.minted) revert BadMaxSupply(maxSupply);
        c.maxSupply = maxSupply;
        emit MaxSupplyLowered(cardId, maxSupply);
    }

    function setCardURI(uint256 cardId, string calldata uri) external onlyOwner {
        _requireCard(cardId);
        Card storage c = _cards[cardId];
        if (c.uriFrozen) revert URIFrozen(cardId);
        c.uri = uri;
        emit CardURISet(cardId, uri);
    }

    /// @notice Закрепить метаданные карточки навсегда, обратного действия нет.
    function freezeCardURI(uint256 cardId) external onlyOwner {
        _requireCard(cardId);
        _cards[cardId].uriFrozen = true;
        emit CardURIFrozen(cardId);
    }

    /// @notice Назначить контракт продажи. Один раз и навсегда, только контракт.
    function setSeller(address seller_) external onlyOwner {
        if (seller != address(0)) revert SellerAlreadySet();
        if (seller_.code.length == 0) revert NotAContract(seller_);
        seller = seller_;
        emit SellerSet(seller_);
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps);
        _setDefaultRoyalty(receiver, bps);
        emit RoyaltySet(receiver, bps);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ======= Внутреннее =======

    function _requireCard(uint256 cardId) private view {
        if (cardId == 0 || cardId > cardCount) revert UnknownCard(cardId);
    }
}
