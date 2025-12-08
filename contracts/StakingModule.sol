 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./NFTDiscount.sol";

/**
 * @title StakingModule (rev‑2)
 * @notice Фикс‑сроковый стейкинг с гибкими наградами.  
 *          ▸ штрафы остаются на контракте и используются как подушка ликвидности  
 *          ▸ добавлена возможность вывести «излишек» штрафных токенов в казну  
 *          ▸ _autoReplenish проверяет и allowance, и фактический баланс treasury  
 *          ▸ rescueTokens для сторонних ERC‑20, чтобы чужие средства не застревали  
 *          ▸ вся публичная логика неизменна, поэтому совместим с текущими фронтами и тестами.
 */
contract StakingModule is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    // ---------------------------------------------------------------------
    // Immutable & basic state
    // ---------------------------------------------------------------------
    IERC20 public token;                // ⚡️больше не immutable — можно обновлять
    NFTDiscount public nftDiscount;
    address public treasury;            // Казна, куда уходит просроченный principal и excess
    uint256 public totalStaked;         // Текущее суммарное "тело" всех активных стейков

    uint256 public constant SECONDS_PER_MONTH = 30 days;
     uint256 public constant GRACE_PERIOD      = 180 days;
    /// Лимит NFT-наград за один unstake
    uint256 public constant MAX_NFT_REWARD    = 20;

    // Кто имеет право вызывать stake/unstake «от имени» токена (прокси-модули проекта)
    mapping(address => bool) public isAuthorizedCaller;

    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 duration; // в месяцах (1‑12)
    }
    mapping(address => StakeInfo[]) public stakes;

    struct RewardConfig {
        uint256 nftCount;
        uint256 discountPercent;
    }
    mapping(uint256 => RewardConfig) public rewardConfigs; // keyed by duration (m)

    struct RewardData {
        uint256 discountPercent;
        uint256 index;
        uint256 ts;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event Staked(address indexed user, uint256 amount, uint256 duration);
    event StakeUpdated(address indexed user, uint256 stakeIndex, uint256 newAmount);
    event Unstaked(address indexed user, uint256 principal, uint256 reward, uint256 penalty, uint256 nftIssued, bool expired);
    event PenaltyTokensTransferred(address indexed treasury, uint256 amount);
    event ExcessSkimmed(address indexed to, uint256 amount);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);
    /// @notice Emitted when NFTDiscount contract address is updated
    event NFTDiscountSet(address indexed newDiscount);
    /// @notice Emitted when treasury address is updated
    event TreasurySet(address indexed newTreasury);
    /// @notice Emitted when reward configuration for a duration is updated
    event RewardConfigUpdated(uint256 indexed duration, uint256 nftCount, uint256 discountPercent);
    event TokenUpdated(address indexed oldToken, address indexed newToken);
    event CallerAuthorized(address indexed caller, bool enabled);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------
    constructor(address _token, address _nftDiscount) {
       require(_token != address(0) && _nftDiscount != address(0), "Invalid addresses");
       token = IERC20(_token);                // стартовая привязка
        nftDiscount = NFTDiscount(_nftDiscount);
        // default reward configs for 3/6/9/12 mo
        rewardConfigs[3]  = RewardConfig(2, 3);
        rewardConfigs[6]  = RewardConfig(2, 5);
        rewardConfigs[9]  = RewardConfig(2, 7);
        rewardConfigs[12] = RewardConfig(2, 10);
    }

    // ---------------------------------------------------------------------
    // Admin setters
    // ---------------------------------------------------------------------
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setNFTDiscount(address _nftDiscount) external onlyOwner whenNotPaused {
        require(_nftDiscount != address(0), "Zero address");
        nftDiscount = NFTDiscount(_nftDiscount);
        emit NFTDiscountSet(_nftDiscount);
    }

    function setTreasury(address _treasury) external onlyOwner whenNotPaused {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

      /// @notice Горячая смена токена. Рекомендуется в паузе, чтобы не было гонок.
       function setToken(address newToken) external onlyOwner {
       require(paused(), "Set token only when paused");
       require(newToken != address(0), "Zero token");
       address old = address(token);
       require(newToken != old, "Same token");
       token = IERC20(newToken);
       emit TokenUpdated(old, newToken);
   }

   /// @notice Разрешить/запретить прокси-контракту вызывать stake/unstake
   function authorizeCaller(address caller, bool enabled) external onlyOwner {
       require(caller != address(0), "Zero caller");
       isAuthorizedCaller[caller] = enabled;
       emit CallerAuthorized(caller, enabled);
   }

        function setRewardConfig(
        uint256 duration,
        uint256 nftCount,
        uint256 discountPercent
    ) external onlyOwner whenNotPaused {
        require(duration >= 1 && duration <= 12,      "Bad duration");
        require(nftCount <= MAX_NFT_REWARD,          "NFT count too large");
        require(discountPercent <= 100,              "Discount >100%");
        rewardConfigs[duration] = RewardConfig(nftCount, discountPercent);
        emit RewardConfigUpdated(duration, nftCount, discountPercent);
    }

    // ---------------------------------------------------------------------
    // **NEW**  Skim & rescue helpers
    // ---------------------------------------------------------------------

    /// @notice Выводит «лишние» токены (штрафы > предусмотренный запас) в казну.
    /// @dev Лимит: нельзя вывести средства, покрывающие текущий `totalStaked`.
    function skimExcessToTreasury(uint256 amount) external onlyOwner whenNotPaused nonReentrant {
        require(treasury != address(0), "Treasury not set");
        uint256 contractBal = token.balanceOf(address(this));
        uint256 available   = contractBal - totalStaked; // штрафная подушка
        require(amount > 0 && amount <= available, "Amount too large");
        token.safeTransfer(treasury, amount);
        emit ExcessSkimmed(treasury, amount);
    }

    /// @notice Спасение сторонних ERC‑20, ошибочно присланных на контракт.
    function rescueTokens(address erc20, address to, uint256 amount) external onlyOwner whenNotPaused nonReentrant {
        require(erc20 != address(token), "Use skimExcess");
        IERC20(erc20).safeTransfer(to, amount);
        emit TokensRescued(erc20, to, amount);
    }
     
       /// @dev Тот самый новый допуск: либо действующий токен, либо доверенный прокси
       modifier onlyTokenOrAuthorized() {
       require(msg.sender == address(token) || isAuthorizedCaller[msg.sender], "Not token/proxy");
       _;
   }

    // ---------------------------------------------------------------------
    // Staking public API (неизменно для совместимости)
    // ---------------------------------------------------------------------
    /// @notice Счётчик для уникальности NFT-URI
         uint256 private rewardNonce;
 
    /// @notice Вносим депозит: только token-контракт или доверенный прокси (IBITIcoin)
    function stakeTokensFor(address staker, uint256 amount, uint256 duration)
       external
       whenNotPaused
       nonReentrant
       onlyTokenOrAuthorized
   {
        require(amount > 0, "Amount zero");
        require(duration >= 1 && duration <= 12, "Invalid duration");
        // slither-disable-next-line arbitrary-from-in-transferfrom
        token.safeTransferFrom(staker, address(this), amount);
        stakes[staker].push(StakeInfo(amount, block.timestamp, duration));
        totalStaked += amount;
        emit Staked(staker, amount, duration);
    }

     function unstakeTokensFor(address staker, uint256 index)
       public
       whenNotPaused
       nonReentrant
       onlyTokenOrAuthorized
   {

    require(treasury != address(0), "Treasury not set");

    StakeInfo[] storage arr = stakes[staker];
    uint256 len = arr.length;
    require(index < len, "Bad index");
    StakeInfo memory info = arr[index];
    require(info.amount > 0, "Empty stake");

    // Расчёт reward/penalty/expiration
    uint256 principal = info.amount;
    uint256 requiredTime = info.duration * SECONDS_PER_MONTH;
    uint256 elapsed = block.timestamp - info.startTime;

    uint256 reward;
    uint256 penalty;
    uint256 nftCnt;
    uint256 discount;
    bool expired;

        if (elapsed < requiredTime) {
        // сначала делим, потом умножаем — чтобы избежать переполнения
        uint256 pct = getPenaltyPercentage(info.duration);
        penalty = (principal / 100) * pct;
    } else if (elapsed <= requiredTime + GRACE_PERIOD) {
        uint256 pct = getRewardPercentage(info.duration);
        reward = (principal / 100) * pct;
        RewardConfig memory cfg = rewardConfigs[info.duration];
        nftCnt   = cfg.nftCount;
        discount = cfg.discountPercent;
    } else {
        expired = true;
    }


    // 1) EFFECTS: сразу фиксируем изменение состояния
    totalStaked -= principal;
    if (index != len - 1) {
        arr[index] = arr[len - 1];
    }
    arr.pop();

    // 2) INTERACTIONS: внешние переводы
    if (expired) {
        token.safeTransfer(treasury, principal);
        emit PenaltyTokensTransferred(treasury, principal);
        emit Unstaked(staker, principal, reward, penalty, nftCnt, expired);
        return;
    }

    uint256 payout = principal + reward - penalty;
    uint256 bal = token.balanceOf(address(this));
    if (bal < payout) {
        _autoReplenish(payout - bal);
    }
    token.safeTransfer(staker, payout);

       // 3) Выдача NFT-наград (не откатываем при ошибке)
        for (uint256 i = 0; i < nftCnt; ++i) {
            // уникальный nonce для каждой попытки минта
            uint256 nonce = rewardNonce++;
            RewardData memory rd = RewardData(discount, i, block.timestamp);
            string memory uri = string(
                abi.encodePacked(
                    "ipfs://defaultRewardMetadata.json#",
                    rd.ts.toString(), "#",
                    Strings.toHexString(uint160(staker), 20), "#",
                    rd.index.toString(), "#",
                    nonce.toString()
                )
            );
            try nftDiscount.mintJackpot(staker, rd.discountPercent, uri) {
              // NFT успешно выдано
          } catch {
              // Логируем, что NFT не выдан (коллизия URI или прочее)
              emit TokensRescued(address(nftDiscount), staker, 0);
          }
      }
      emit Unstaked(staker, principal, reward, penalty, nftCnt, expired);
    }

    function unstakeTokens() external whenNotPaused { unstakeTokensFor(msg.sender, 0); }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------
    function getStakeCount(address staker) external view returns (uint256) { return stakes[staker].length; }
    function getStakeInfo(address staker, uint256 index) external view returns (StakeInfo memory) {
        require(index < stakes[staker].length, "Bad index");
        return stakes[staker][index];
    }

    /// @notice Чистые «свободные» токены (штрафы), которыми можно пополнить казну.
    function excessTokens() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal > totalStaked ? bal - totalStaked : 0;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _autoReplenish(uint256 need) internal {
        uint256 allow = token.allowance(treasury, address(this));
        uint256 treBal = token.balanceOf(treasury);
        require(allow >= need && treBal >= need, "Treasury cannot cover");
        // slither-disable-next-line arbitrary-from-in-transferfrom
        token.safeTransferFrom(treasury, address(this), need);
    }

    function getPenaltyPercentage(uint256 m) public pure returns (uint256) {
        if (m == 1) return 1;  if (m == 2) return 3;  if (m == 3) return 5;  if (m == 4) return 7;
        if (m == 5) return 10; if (m == 6) return 12; if (m == 7) return 14; if (m == 8) return 18;
        if (m == 9) return 20; if (m == 10) return 22; if (m == 11) return 25; return 30;
    }

    function getRewardPercentage(uint256 m) public pure returns (uint256) {
        if (m == 1) return 1;  if (m == 2) return 3;  if (m == 3) return 5;  if (m == 4) return 7;
        if (m == 5) return 10; if (m == 6) return 12; if (m == 7) return 14; if (m == 8) return 18;
        if (m == 9) return 20; if (m == 10) return 22; if (m == 11) return 25; return 30;
    }

    function _mintRewardNFTLoop(address staker, uint256 cnt, uint256 discount) internal {
        for (uint256 i; i < cnt; ++i) {
            _mintRewardNFT(staker, RewardData(discount, i, block.timestamp));
        }
    }

    function _mintRewardNFT(address staker, RewardData memory reward) internal {
        string memory uri = string(
            abi.encodePacked(
                "ipfs://defaultRewardMetadata.json#",
                reward.ts.toString(), "#",
                Strings.toHexString(uint160(staker), 20), "#",
                reward.index.toString() 
            )
        );
        nftDiscount.mintJackpot(staker, reward.discountPercent, uri);
    }
     
     // ---------------------------------------------------------------------
     // Приостановка и аварийные выходы
     // ---------------------------------------------------------------------
    /// @notice Экстренный выход из стейка при паузе: возвращает только principal, без reward/penalty и NFT
    function emergencyUnstake(uint256 index) external nonReentrant whenPaused {
        StakeInfo[] storage arr = stakes[msg.sender];
        uint256 len = arr.length;
        require(index < len, "Bad index");
        StakeInfo memory info = arr[index];
        uint256 principal = info.amount;
        require(principal > 0, "Empty stake");

        // 1) EFFECTS: удаляем запись и уменьшаем totalStaked
        totalStaked -= principal;
        if (index != len - 1) {
            arr[index] = arr[len - 1];
        }
        arr.pop();

        // 2) INTERACTIONS: возвращаем principal пользователю
        token.safeTransfer(msg.sender, principal);
        // генерируем событие Unstaked (без reward/penalty/NFT)
        emit Unstaked(msg.sender, principal, 0, 0, 0, false);
    }

}
