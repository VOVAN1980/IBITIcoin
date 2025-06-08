// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./NFTDiscount.sol";

/// @title PhasedTokenSale
/// @notice Фазовая продажа IBITI за USDT с whitelist, объемными бонусами,
///         реферальной программой и аирдропом Jackpot-NFT, плюс пост-фазовая продажа
contract PhasedTokenSale is Ownable {
    using SafeERC20 for IERC20Metadata;
    using Strings       for uint256;

    struct Phase {
        uint256 start;        // UNIX-время старта
        uint256 end;          // UNIX-время конца
        uint256 priceCents;   // цена в центах USDT за 1 IBITI
        uint256 cap;          // макс. IBITI в фазе (миним. ед.)
        uint256 sold;         // уже продано
        bool    whitelistOnly;// только для whitelist
    }

    struct VolumeBonus {
        uint256 threshold;    // минимум IBITI для бонуса
        uint16  bonusPct;     // бонус в %, например 5 → +5%
    }

    IERC20Metadata public immutable ibiti;
    IERC20Metadata public immutable usdt;
    uint8  public immutable ibitiDecimals;
    uint8  public immutable usdtDecimals;
    uint256 public immutable usdtMultiplier;    // 10^(usdtDecimals−2)
    uint256 public immutable ibitiDenominator;  // 10^ibitiDecimals

    Phase[]       public phases;
    VolumeBonus[] public volumeBonuses;

    /// @notice Объёмный дисконт: минимальный объём и цены для трёх фаз
    uint256 public discountThreshold;
    uint256 public discountedPricePhase1;
    uint256 public discountedPricePhase2;
    uint256 public discountedPricePhase3;

    mapping(address => bool)    public whitelist;
    mapping(address => uint256) public referralRewards;
    uint256 public rewardAmount;  // IBITI за одного реферала
    uint256 public rewardTokens;  // резерв IBITI для рефералов

    NFTDiscount public discountContract;
    uint256     public airdropDiscountPercent;
    string      public airdropBaseURI;
    mapping(address => bool) public airdropped;

    /// @notice Цена в центах USDT за 1 IBITI, когда все фазы завершены
    uint256 public fallbackPrice;
    event FallbackPriceUpdated(uint256 newPriceCents);

    event PhaseAdded(
        uint256 indexed phaseId,
        uint256 start,
        uint256 end,
        uint256 priceCents,
        uint256 cap,
        bool    whitelistOnly
    );
    event VolumeBonusAdded(
        uint256 indexed bonusId,
        uint256 threshold,
        uint16  bonusPct
    );
    event WhitelistSet(address indexed who, bool ok);
    event RewardReserveSet(uint256 amount);
    event JackpotAirdropConfigured(
        address indexed discountContract,
        uint256 discountPercent,
        string  baseURI
    );
    event Bought(
        address indexed buyer,
        uint256 indexed phaseId,
        uint256 ibitiAmount,
        uint256 paidUSDT,
        address indexed referrer,
        uint256 bonusIBITI
    );
    event RewardPaid(address indexed inviter, address indexed invitee, uint256 amount);
    event WithdrawnUSDT(address indexed to, uint256 amount);
    event WithdrawnIBITI(address indexed to, uint256 amount);
    event ReferralClaimed(address indexed who, uint256 amount);
    event VolumeDiscountUpdated(
        uint256 threshold,
        uint256 pricePhase1,
        uint256 pricePhase2,
        uint256 pricePhase3
    );

    /// @param _ibiti        IBITI-token (ожидает 8 децималей)
    /// @param _usdt         USDT-token (ожидает ≥2 децималей)
    /// @param _rewardAmount Сколько IBITI платить за каждого реферала
    constructor(
        address _ibiti,
        address _usdt,
        uint256 _rewardAmount
    ) {
        ibiti          = IERC20Metadata(_ibiti);
        usdt           = IERC20Metadata(_usdt);
        ibitiDecimals  = ibiti.decimals();
        usdtDecimals   = usdt.decimals();
        require(usdtDecimals >= 2, "USDT decimals<2");
        usdtMultiplier   = 10 ** (usdtDecimals - 2);
        ibitiDenominator = 10 ** ibitiDecimals;
        rewardAmount     = _rewardAmount;
    }

    /// @notice Добавить фазу предпродажи
    function addPhase(
        uint256 start,
        uint256 end,
        uint256 priceCents,
        uint256 cap,
        bool    whitelistOnly
    ) external onlyOwner {
        require(start < end, "invalid window");
        phases.push(Phase(start, end, priceCents, cap, 0, whitelistOnly));
        emit PhaseAdded(phases.length - 1, start, end, priceCents, cap, whitelistOnly);
    }

    /// @notice Добавить объемный бонус
    function addVolumeBonus(uint256 threshold, uint16 bonusPct) external onlyOwner {
        require(bonusPct > 0 && bonusPct <= 100, "invalid pct");
        volumeBonuses.push(VolumeBonus(threshold, bonusPct));
        emit VolumeBonusAdded(volumeBonuses.length - 1, threshold, bonusPct);
    }

    /// @notice Управление whitelist
    function setWhitelist(address who, bool ok) external onlyOwner {
        whitelist[who] = ok;
        emit WhitelistSet(who, ok);
    }

    /// @notice Установить резерв IBITI для реферальных выплат
    function setRewardReserve(uint256 amount) external onlyOwner {
        rewardTokens = amount;
        emit RewardReserveSet(amount);
    }

    /// @notice Конфиг аирдропа Jackpot-NFT
    function setJackpotAirdrop(
        NFTDiscount _discountContract,
        uint256     _discountPercent,
        string calldata _baseURI
    ) external onlyOwner {
        require(_discountPercent != 100, "Pandora reserved");
        discountContract       = _discountContract;
        airdropDiscountPercent = _discountPercent;
        airdropBaseURI         = _baseURI;
        emit JackpotAirdropConfigured(address(_discountContract), _discountPercent, _baseURI);
    }

    /// @notice Настроить параметры объёмного дисконта
    function setVolumeDiscount(
        uint256 threshold,
        uint256 p1,
        uint256 p2,
        uint256 p3
    ) external onlyOwner {
        discountThreshold      = threshold;
        discountedPricePhase1  = p1;
        discountedPricePhase2  = p2;
        discountedPricePhase3  = p3;
        emit VolumeDiscountUpdated(threshold, p1, p2, p3);
    }

    /// @notice Владелец может вывести накопленные USDT
    function withdrawUSDT(uint256 amount) external onlyOwner {
        usdt.safeTransfer(msg.sender, amount);
        emit WithdrawnUSDT(msg.sender, amount);
    }

    /// @notice Владелец может вывести накопленные IBITI
    function withdrawIBITI(uint256 amount) external onlyOwner {
        ibiti.safeTransfer(msg.sender, amount);
        emit WithdrawnIBITI(msg.sender, amount);
    }

    /// @notice Получить накопленные реферальные IBITI
    function claimReferral() external {
        uint256 amt = referralRewards[msg.sender];
        require(amt > 0, "no rewards");
        referralRewards[msg.sender] = 0;
        ibiti.safeTransfer(msg.sender, amt);
        emit ReferralClaimed(msg.sender, amt);
    }

    /// @notice Установить цену после всех фаз (центов USDT)
    function setFallbackPrice(uint256 _priceCents) external onlyOwner {
        fallbackPrice = _priceCents;
        emit FallbackPriceUpdated(_priceCents);
    }

    /// @notice Основная покупка: IBITI за USDT + бонусы + Jackpot-NFT + пост-фазы
    function buy(uint256 tokenAmount, address referrer) external {
        uint256 now_ = block.timestamp;

        // Фазовая продажа
        for (uint256 i; i < phases.length; ++i) {
            Phase storage p = phases[i];
            if (now_ < p.start)  revert("not started");
            if (now_ > p.end)    continue;

            if (p.whitelistOnly) {
                require(whitelist[msg.sender], "not whitelisted");
            }
            require(p.sold + tokenAmount <= p.cap, "cap exceeded");
            p.sold += tokenAmount;

            // Цена с объёмным дисконтом
            uint256 priceCents = p.priceCents;
            if (tokenAmount >= discountThreshold) {
                if (i == 0)      priceCents = discountedPricePhase1;
                else if (i == 1) priceCents = discountedPricePhase2;
                else             priceCents = discountedPricePhase3;
            }

            // Рассчитать и принять USDT
            uint256 pay = (tokenAmount * priceCents * usdtMultiplier) / ibitiDenominator;
            usdt.safeTransferFrom(msg.sender, address(this), pay);

            // Выдать IBITI + bonus
            uint256 bonus;
            for (uint256 j; j < volumeBonuses.length; ++j) {
                VolumeBonus storage vb = volumeBonuses[j];
                if (tokenAmount >= vb.threshold) {
                    bonus = (tokenAmount * vb.bonusPct) / 100;
                }
            }
            ibiti.safeTransfer(msg.sender, tokenAmount + bonus);

            // Реферальный бонус
            if (
                referrer != address(0)
                && referrer != msg.sender
                && rewardTokens >= rewardAmount
            ) {
                rewardTokens -= rewardAmount;
                referralRewards[referrer] += rewardAmount;
                ibiti.safeTransfer(referrer, rewardAmount);
                emit RewardPaid(referrer, msg.sender, rewardAmount);
            }

            // Одноразовый NFT-джекпот
            if (
                address(discountContract) != address(0)
                && !airdropped[msg.sender]
            ) {
                airdropped[msg.sender] = true;
                string memory uri = string(
                    abi.encodePacked(
                        airdropBaseURI,
                        "#buyer#", Strings.toHexString(uint160(msg.sender), 20),
                        "#phase#", Strings.toString(i),
                        "#ts#",    Strings.toString(now_)
                    )
                );
                discountContract.mintJackpot(
                    msg.sender,
                    airdropDiscountPercent,
                    uri
                );
            }

            emit Bought(msg.sender, i, tokenAmount, pay, referrer, bonus);
            return;
        }

        // === Пост-фазовая продажа по fallbackPrice ===
        require(fallbackPrice > 0, "sale inactive & no fallback price");

        uint256 payFallback = (tokenAmount * fallbackPrice * usdtMultiplier) / ibitiDenominator;
        usdt.safeTransferFrom(msg.sender, address(this), payFallback);
        ibiti.safeTransfer(msg.sender, tokenAmount);

        emit Bought(msg.sender, type(uint256).max, tokenAmount, payFallback, referrer, 0);
    }
}
