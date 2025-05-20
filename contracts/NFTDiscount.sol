// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ERC-721 storage extension
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFTDiscount
 * @notice Implements non-fungible tokens that grant fee discounts in the IBITI ecosystem.
 * @dev Supports multiple discount levels with unique metadata URIs, monthly mint/transfer limits,
 *      automatic expiration (except for Pandora), and bonus awarding for voting and staking.
 *      Добавлена возможность экстренной приостановки всех трансферов и функций использования.
 */
contract NFTDiscount is ERC721URIStorage, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;
    using SafeERC20 for IERC20;

    IERC20 public payToken;
    IERC20 public ibitiToken;
    uint256 public nftPrice;

    /// @notice Кто может mint-ить Jackpot-NFT (DAO, стейкинг и др.)
    mapping(address => bool) public jackpotMinters;
    /// @notice По умолчанию владелец контракта — оператор скидок
    address public discountOperator = msg.sender;
    /// @notice Назначена/отозвана роль mintJackpot
    event JackpotMinterSet(address indexed minter, bool enabled);
    /// @notice Любые случайно присланные ERC-20 возвращены в owner()
    event TokensRescued(address indexed erc20, uint256 amount);

    /// @notice Available discount levels.
    enum NFTLevel { Normal, Rare, Legendary, Epic, Pandora, Jackpot }

    /// @notice Internal data for each minted NFT.
    struct DiscountNFT {
        uint256 discountPercent;
        NFTLevel level;
        uint256 lastTransferTime;
        uint256 purchaseTime;
        bool used;
        uint256 usageCount;
        uint256 lastUsageReset;
    }

    mapping(uint256 => DiscountNFT) public discountData;
    // флаг «уже был использован» для каждого токена
    mapping(uint256 => bool) private _used;
    mapping(NFTLevel => uint256)    public mintedCount;
    mapping(NFTLevel => uint256)    public supplyCap;
    mapping(string => bool)         public mintedURIs;
    uint256                         public nextTokenId;
    mapping(address => mapping(NFTLevel => uint256)) public monthlyMintCount;
    mapping(address => mapping(NFTLevel => uint256)) public lastMintReset;
    mapping(address => mapping(NFTLevel => uint256)) public monthlyTransferCount;
    mapping(address => mapping(NFTLevel => uint256)) public lastTransferReset;
    mapping(NFTLevel => uint256)    public monthlyLimit;

    uint256 public constant NORMAL_COOLDOWN    = 0;
    uint256 public constant RARE_COOLDOWN      = 0;
    uint256 public constant LEGENDARY_COOLDOWN = 0;
    uint256 public constant EPIC_COOLDOWN      = 0;

    address public daoModule;
    address public stakingModule;
    uint256 public lastVotingRewardTime;
    
    // --- Настраиваемые параметры наград (дефолт: 3%,2шт для победителей; 1%,2шт для проигравших) ---
    uint256 public yesRewardPercent  = 3;
    uint256 public yesRewardCount    = 2;
    uint256 public noRewardPercent   = 1;
    uint256 public noRewardCount     = 2;
    uint256 public totalWinners;
    uint256 public totalLosers;

    // --- Events ---
    event NFTMinted(address indexed to, uint256 indexed tokenId, uint256 discountPercent, NFTLevel level);
    event NFTMintedPandora(address indexed to, uint256 indexed tokenId);
    event NFTMintedJackpot(address indexed to, uint256 indexed tokenId, uint256 discountPercent);
    event SupplyCapUpdated(NFTLevel level, uint256 newCap);
    event DAOModuleSet(address daoModule);
    event StakingModuleSet(address stakingModule);
    event MonthlyLimitUpdated(NFTLevel level, uint256 newLimit);
    event DiscountOperatorSet(address operator);
    event VotingRewardsIssued(uint256 timestamp, address[] winners, address[] losers);
    event NFTTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    event NFTUsed(address indexed user, uint256 indexed tokenId, uint256 discountPercent);
    event NFTUpdated(uint256 oldTokenId, uint256 newTokenId, string newURI);
    /// @notice Любое сгорание NFT (ручное, auto-expire или update)  
    event NFTBurned(uint256 indexed tokenId);

    constructor() ERC721("DiscountNFT", "NFTDIS") {
        // default supply caps
        supplyCap[NFTLevel.Normal]    = type(uint256).max;
        supplyCap[NFTLevel.Rare]      = type(uint256).max;
        supplyCap[NFTLevel.Legendary] = type(uint256).max;
        supplyCap[NFTLevel.Epic]      = type(uint256).max;
        supplyCap[NFTLevel.Pandora]   = type(uint256).max;
        supplyCap[NFTLevel.Jackpot]   = type(uint256).max;

        // monthly limits
        monthlyLimit[NFTLevel.Normal]     = 10;
        monthlyLimit[NFTLevel.Rare]       = 15;
        monthlyLimit[NFTLevel.Legendary]  = 6;
        monthlyLimit[NFTLevel.Epic]       = 3;
        monthlyLimit[NFTLevel.Pandora]    = 1;
        monthlyLimit[NFTLevel.Jackpot]    = type(uint256).max;
     }

        function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    function _requireNotPaused() internal view override {
        require(!paused(), "Contract is paused");
    }

    function setPayToken(address _token) external onlyOwner whenNotPaused {
        require(_token != address(0), "Zero address");
        payToken = IERC20(_token);
    }

    function setIbitiToken(address _token) external onlyOwner whenNotPaused {
        require(_token != address(0), "Zero address");
        ibitiToken = IERC20(_token);
    }

    function setNftPrice(uint256 _price) external onlyOwner whenNotPaused {
        require(_price > 0, "Price must be >0");
        nftPrice = _price;
     }

       // --- Admin setters ---
    function buyDiscountNFTForUSDT(uint256 discountPercent, string calldata tokenURI) external whenNotPaused nonReentrant {
        require(address(payToken) != address(0) && nftPrice > 0, "Payment not configured");
        payToken.safeTransferFrom(msg.sender, address(this), nftPrice);
        _mintDiscount(msg.sender, discountPercent, tokenURI);
    }

    function buyDiscountNFTForIBI(uint256 discountPercent, string calldata tokenURI) external whenNotPaused nonReentrant {
        require(address(ibitiToken) != address(0) && nftPrice > 0, "Payment not configured");
        ibitiToken.safeTransferFrom(msg.sender, address(this), nftPrice);
        _mintDiscount(msg.sender, discountPercent, tokenURI);
    }

    /// @notice Owner withdrawal of accumulated payments. Blocked on pause.
       function withdrawPayments(address to, uint256 amount)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        if (address(payToken) != address(0)) {
            payToken.safeTransfer(to, amount);
        }
        if (address(ibitiToken) != address(0)) {
            ibitiToken.safeTransfer(to, amount);
        }
     }
    
        function setDAOModule(address _daoModule) external onlyOwner whenNotPaused {
        require(_daoModule != address(0), "Zero address not allowed");
        daoModule = _daoModule;
        emit DAOModuleSet(_daoModule);
    }

    function setStakingModule(address _stakingModule) external onlyOwner whenNotPaused {
    require(_stakingModule != address(0), "Zero address not allowed");
    stakingModule = _stakingModule;
    emit StakingModuleSet(_stakingModule);
  }

    /// @notice Назначает контракт-оператор, который сможет вызывать useDiscountFor().
    function setDiscountOperator(address _operator)
        external
        onlyOwner
        whenNotPaused
    {
        require(_operator != address(0), "Zero address not allowed");
        discountOperator = _operator;
        emit DiscountOperatorSet(_operator);
     }

    /// @notice Дает или отзывает право mintJackpot у `minter`
    function setJackpotMinter(address minter, bool enabled)
    external onlyOwner whenNotPaused
  {
    jackpotMinters[minter] = enabled;
    emit JackpotMinterSet(minter, enabled);
   }    

    function setMonthlyLimit(NFTLevel level, uint256 newLimit) external onlyOwner whenNotPaused {
    monthlyLimit[level] = newLimit;
    emit MonthlyLimitUpdated(level, newLimit);
  }

    function setSupplyCap(NFTLevel level, uint256 newCap) external onlyOwner whenNotPaused {
    supplyCap[level] = newCap;
    emit SupplyCapUpdated(level, newCap);
  }

        /// @notice Устанавливает полные размеры массивов winners и losers перед batch-выдачей
    function setTotalParticipants(uint256 _totalWinners, uint256 _totalLosers)
        external onlyOwner whenNotPaused
    {
        require(_totalWinners > 0, "Winners>0");
        require(_totalLosers > 0, "Losers>0");
        totalWinners = _totalWinners;
        totalLosers  = _totalLosers;
    }

        /// @notice Изменяет параметры наград для победителей (pct —%, count — число NFT)
    function setYesRewardParams(uint256 pct, uint256 count) external onlyOwner {
        require(pct <= 100, "pct>100");
        require(count > 0, "count==0");
        yesRewardPercent = pct;
        yesRewardCount   = count;
    }

    /// @notice Изменяет параметры наград для проигравших (pct —%, count — число NFT)
    function setNoRewardParams(uint256 pct, uint256 count) external onlyOwner {
        require(pct <= 100, "pct>100");
        require(count > 0, "count==0");
        noRewardPercent = pct;
        noRewardCount   = count;
    }

   // --- Internal common mint logic ---
    function _mintDiscount(
    address to,
    uint256 discountPercent,
    string memory tokenURI
) internal whenNotPaused {
    require(!mintedURIs[tokenURI], "URI already used");
    NFTLevel level = _levelFromDiscount(discountPercent);
    require(mintedCount[level] < supplyCap[level], "Supply cap reached");
    _resetMonthlyMintCount(to, level);
    require(monthlyMintCount[to][level] < monthlyLimit[level], "Monthly mint limit reached");
    monthlyMintCount[to][level]++;

    uint256 tokenId = nextTokenId++;
    _mint(to, tokenId);
    _setTokenURI(tokenId, _convertToHttps(tokenURI));
    mintedURIs[tokenURI] = true;

    discountData[tokenId] = DiscountNFT({
        discountPercent: discountPercent,
        level: level,
        lastTransferTime: block.timestamp,
        purchaseTime: block.timestamp,
        used: false,
        usageCount: 0,
        lastUsageReset: level == NFTLevel.Pandora ? block.timestamp : 0
    });
    mintedCount[level]++;
    emit NFTMinted(to, tokenId, discountPercent, level);
    }

      // --- Minting ---
     /// @notice Чеканит NFT-дисконты: владелец, дисконт-оператор, DAO-модуль или Staking-модуль.
    function mint(address to, uint256 discountPercent, string memory tokenURI)
        public
        whenNotPaused
    {
        require(
            msg.sender == owner()          ||
            msg.sender == discountOperator ||
            msg.sender == daoModule        ||
            msg.sender == stakingModule,
            "Not authorized"
        );
        _mintDiscount(to, discountPercent, tokenURI);
    }

    function mintPandora(address to, string memory tokenURI)
        public onlyOwner whenNotPaused
    {
        require(!mintedURIs[tokenURI], "URI already used");

        NFTLevel level = NFTLevel.Pandora;
        require(mintedCount[level] < supplyCap[level], "Supply cap reached");

        _resetMonthlyMintCount(to, level);
        require(monthlyMintCount[to][level] < monthlyLimit[level], "Monthly mint limit reached");
        monthlyMintCount[to][level]++;

        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);
        _setTokenURI(tokenId, _convertToHttps(tokenURI));
        mintedURIs[tokenURI] = true;

        discountData[tokenId] = DiscountNFT({
            discountPercent: 100,
            level: level,
            lastTransferTime: block.timestamp,
            purchaseTime: block.timestamp,
            used: false,
            usageCount: 0,
            lastUsageReset: block.timestamp
        });
        mintedCount[level]++;
        emit NFTMinted(to, tokenId, 100, level);
        emit NFTMintedPandora(to, tokenId);
    }

     function mintJackpot(address to, uint256 discountPercent, string memory tokenURI)
     public whenNotPaused
    {
     // только владелец, daoModule, stakingModule или адреса из jackpotMinters
     require(
        msg.sender == owner() ||
        msg.sender == daoModule ||
        msg.sender == stakingModule ||
        jackpotMinters[msg.sender],
        "Not authorized for Jackpot mint"
     );

     // скидка 100% (Pandora) не выдаётся через джекпот
     require(discountPercent != 100, "Pandora reserved");
     require(!mintedURIs[tokenURI], "URI already used");

     NFTLevel level = NFTLevel.Jackpot;
     require(mintedCount[level] < supplyCap[level], "Supply cap reached for Jackpot");

     uint256 tokenId = nextTokenId++;
     _mint(to, tokenId);
     _setTokenURI(tokenId, _convertToHttps(tokenURI));
     mintedURIs[tokenURI] = true;

     discountData[tokenId] = DiscountNFT({
        discountPercent: discountPercent,
        level: level,
        lastTransferTime: block.timestamp,
        purchaseTime: block.timestamp,
        used: false,
        usageCount: 0,
        lastUsageReset: 0
     });
     mintedCount[level]++;
     emit NFTMintedJackpot(to, tokenId, discountPercent);
    }

    // --- Usage ---
    function useDiscount(uint256 tokenId) external whenNotPaused {
    require(ownerOf(tokenId) == msg.sender, "Not owner");
    // 1) Проверка срока годности и сжигание, если NFT просрочен
    if (checkAndBurnIfExpired(tokenId)) {
        revert("Discount NFT expired");
    }
     _consumeDiscount(msg.sender, tokenId);
    }

    function useDiscountFor(address user, uint256 tokenId) external whenNotPaused {
    require(msg.sender == discountOperator, "Not authorized");
    // 2) Проверка срока годности и сжигание, если NFT просрочен
    if (checkAndBurnIfExpired(tokenId)) {
        revert("Discount NFT expired");
    }
     _consumeDiscount(user, tokenId);
    }

    function usePandora(uint256 tokenId) external whenNotPaused nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        DiscountNFT storage d = discountData[tokenId];
        require(d.level == NFTLevel.Pandora, "Not Pandora");
        if (block.timestamp >= d.lastUsageReset + 360 days) {
            d.usageCount = 0;
            d.lastUsageReset = block.timestamp;
        }
        require(d.usageCount < 10, "Usage limit reached");
        d.usageCount++;
        emit NFTUsed(msg.sender, tokenId, d.discountPercent);
    }

    function usePandoraFor(address user, uint256 tokenId)
        external whenNotPaused nonReentrant
    {
        require(msg.sender == discountOperator, "Not authorized");
        require(ownerOf(tokenId) == user, "Not owner");
        DiscountNFT storage d = discountData[tokenId];
        require(d.level == NFTLevel.Pandora, "Not Pandora");
        if (block.timestamp >= d.lastUsageReset + 360 days) {
            d.usageCount = 0;
            d.lastUsageReset = block.timestamp;
        }
        require(d.usageCount < 10, "Usage limit reached");
        d.usageCount++;
        emit NFTUsed(user, tokenId, d.discountPercent);
    }

    // --- Transfer hook ---
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256)
        internal override whenNotPaused
    {
        super._beforeTokenTransfer(from, to, tokenId, 1);
        if (from == address(0) || to == address(0)) return;

        DiscountNFT storage d = discountData[tokenId];
        if (d.level == NFTLevel.Jackpot) {
            revert("Jackpot NFTs are non-transferable");
        }
        if (d.level != NFTLevel.Pandora && checkAndBurnIfExpired(tokenId)) {
            return;
        }

        uint256 cooldown = _getCooldown(d.level);
        require(block.timestamp >= d.lastTransferTime + cooldown, "Transfer cooldown");
        d.lastTransferTime = block.timestamp;

        _resetMonthlyTransferCount(to, d.level);
        require(monthlyTransferCount[to][d.level] < monthlyLimit[d.level], "Monthly transfer limit");
        monthlyTransferCount[to][d.level]++;

        // Дополнительная проверка лимита получателя по приходу
        _resetMonthlyMintCount(to, d.level);
        require(
        monthlyMintCount[to][d.level] < monthlyLimit[d.level],
       "Recipient monthly limit reached"

      );
        monthlyMintCount[to][d.level]++;

        emit NFTTransferred(tokenId, from, to);
    }

    // --- Internal helpers ---
    function _consumeDiscount(address user, uint256 tokenId) internal {
        if (checkAndBurnIfExpired(tokenId)) return;
        DiscountNFT storage d = discountData[tokenId];
        require(!d.used, "Already used");
        require(d.level != NFTLevel.Pandora, "Use usePandora for Pandora");
        d.used = true;
        _burn(tokenId);
        emit NFTUsed(user, tokenId, d.discountPercent);
    }

    function checkAndBurnIfExpired(uint256 tokenId) internal returns (bool) {
        DiscountNFT storage d = discountData[tokenId];
        if (d.level == NFTLevel.Pandora) return false;

        uint256 period =
              d.level == NFTLevel.Normal    ? 30 days  :
              d.level == NFTLevel.Rare      ? 90 days  :
              d.level == NFTLevel.Legendary ? 180 days :
              d.level == NFTLevel.Epic      ? 365 days :
              d.level == NFTLevel.Jackpot   ? 365 days : 0;

        if (period > 0 && block.timestamp >= d.purchaseTime + period) {
            _burn(tokenId);
            return true;
        }
        return false;
    }

    function _getCooldown(NFTLevel level) internal pure returns (uint256) {
        if (level == NFTLevel.Normal)    return NORMAL_COOLDOWN;
        if (level == NFTLevel.Rare)      return RARE_COOLDOWN;
        if (level == NFTLevel.Legendary) return LEGENDARY_COOLDOWN;
        if (level == NFTLevel.Epic)      return EPIC_COOLDOWN;
        return 0;
    }

    function _convertToHttps(string memory uri) internal pure returns (string memory) {
    bytes memory b = bytes(uri);
    // если URI слишком короткий, возвращаем без изменений
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

    function _resetMonthlyMintCount(address user, NFTLevel level) internal {
        if (block.timestamp >= lastMintReset[user][level] + 30 days) {
            monthlyMintCount[user][level] = 0;
            lastMintReset[user][level] = block.timestamp;
        }
    }

    function _resetMonthlyTransferCount(address user, NFTLevel level) internal {
        if (block.timestamp >= lastTransferReset[user][level] + 30 days) {
            monthlyTransferCount[user][level] = 0;
            lastTransferReset[user][level] = block.timestamp;
        }
    }

    function _levelFromDiscount(uint256 pct) internal pure returns (NFTLevel) {
        if (pct == 1)                           return NFTLevel.Normal;
        if (pct == 3 || pct == 5 || pct == 7)   return NFTLevel.Rare;
        if (pct == 10 || pct == 15 || pct == 25) return NFTLevel.Legendary;
        if (pct == 50 || pct == 75 || pct == 100) return NFTLevel.Epic;
        revert("Invalid discount percent");
    }

    /**
     * @notice "Burn and Mint" function for updating an NFT.
     */
    function updateNFT(uint256 tokenId, string memory newTokenURI)
        external onlyOwner whenNotPaused nonReentrant
    {
        address ownerNFT = ownerOf(tokenId);
        require(ownerNFT != address(0), "Invalid token");
        require(!mintedURIs[newTokenURI], "New URI already used");

        uint256 originalPurchaseTime   = discountData[tokenId].purchaseTime;
        uint256 originalDiscount       = discountData[tokenId].discountPercent;
        NFTLevel originalLevel         = discountData[tokenId].level;
        uint256 originalLastUsageReset = discountData[tokenId].lastUsageReset;

        _burn(tokenId);

        uint256 newTokenId = nextTokenId++;
        _mint(ownerNFT, newTokenId);
        _setTokenURI(newTokenId, _convertToHttps(newTokenURI));
        mintedURIs[newTokenURI] = true;

        discountData[newTokenId] = DiscountNFT({
            discountPercent: originalDiscount,
            level: originalLevel,
            lastTransferTime: block.timestamp,
            purchaseTime: originalPurchaseTime,
            used: false,
            usageCount: 0,
            lastUsageReset: originalLevel == NFTLevel.Pandora ? originalLastUsageReset : 0
        });

        emit NFTUpdated(tokenId, newTokenId, newTokenURI);
     }
       
       /// @notice Возвращает любые случайно присланные ERC-20 в owner()
         function rescueERC20(address erc20, uint256 amount)
         external onlyOwner nonReentrant
     {
         IERC20(erc20).safeTransfer(owner(), amount);
         emit TokensRescued(erc20, amount);
     }
       
        // -------------------------------------------------------------------
      // Переопределяем _burn, чтобы на любое сжигание NFT эмитить NFTBurned
    // -------------------------------------------------------------------
    function _burn(uint256 tokenId)
        internal
        virtual
        override(ERC721URIStorage)
    {
        super._burn(tokenId);
        emit NFTBurned(tokenId);
        if (_used[tokenId]) {
        delete _used[tokenId];
     }
  }  

            // -------------------------------------------------------------------
    // Восстановление on-chain выдачи наград и batch-функции
    // -------------------------------------------------------------------

    /// @notice Выдаёт награды победителям и проигравшим с параметрами yesReward*/noReward*
    function awardVotingRewards(
        address[] calldata winners,
        address[] calldata losers,
        string calldata baseURI
    ) external whenNotPaused {
        require(msg.sender == owner() || msg.sender == daoModule, "Not authorized to award rewards");
        require(block.timestamp >= lastVotingRewardTime + 30 days, "Voting rewards already awarded this month");
        lastVotingRewardTime = block.timestamp;

        // Победители
        for (uint256 i = 0; i < winners.length; i++) {
            for (uint256 k = 0; k < yesRewardCount; k++) {
                uint256 idx = i + k * winners.length;
                string memory uri = string(
                    abi.encodePacked(
                        baseURI,
                        "#winner#",
                        Strings.toHexString(uint160(winners[i]), 20),
                        "#",
                        Strings.toString(idx)
                    )
                );
                mintJackpot(winners[i], yesRewardPercent, uri);
            }
        }

        // Проигравшие
        for (uint256 i = 0; i < losers.length; i++) {
            for (uint256 k = 0; k < noRewardCount; k++) {
                uint256 idx = i + k * losers.length;
                string memory uri = string(
                    abi.encodePacked(
                        baseURI,
                        "#loser#",
                        Strings.toHexString(uint160(losers[i]), 20),
                        "#",
                        Strings.toString(idx)
                    )
                );
                mintJackpot(losers[i], noRewardPercent, uri);
            }
        }

        emit VotingRewardsIssued(block.timestamp, winners, losers);
    }

    /// @notice Batch-выдача наград победителям (subset winners)
    function awardWinnersBatch(
        address[] calldata winnersSubset,
        string calldata baseURI
    ) external whenNotPaused {
        require(msg.sender == owner() || msg.sender == daoModule, "Not authorized");
        for (uint256 i = 0; i < winnersSubset.length; i++) {
            for (uint256 k = 0; k < yesRewardCount; k++) {
                uint256 idx = i + k * totalWinners;
                string memory uri = string(
                    abi.encodePacked(
                        baseURI,
                        "#winner#",
                        Strings.toHexString(uint160(winnersSubset[i]), 20),
                        "#",
                        Strings.toString(idx)
                    )
                );
                mintJackpot(winnersSubset[i], yesRewardPercent, uri);
            }
        }
    }

    /// @notice Batch-выдача наград проигравшим (subset losers)
    function awardLosersBatch(
        address[] calldata losersSubset,
        string calldata baseURI
    ) external whenNotPaused {
        require(msg.sender == owner() || msg.sender == daoModule, "Not authorized");
        for (uint256 i = 0; i < losersSubset.length; i++) {
            for (uint256 k = 0; k < noRewardCount; k++) {
                uint256 idx = i + k * totalLosers;
                string memory uri = string(
                    abi.encodePacked(
                        baseURI,
                        "#loser#",
                        Strings.toHexString(uint160(losersSubset[i]), 20),
                        "#",
                        Strings.toString(idx)
                    )
                );
                mintJackpot(losersSubset[i], noRewardPercent, uri);
            }
        }
    }
}  // конец контракта NFTDiscount
