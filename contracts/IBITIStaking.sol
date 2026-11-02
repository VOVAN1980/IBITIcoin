// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title IBITIStaking
 * @notice Стейкинг IBITI на 1–12 месяцев с заранее известной наградой.
 *
 *         Запас наград лежит на этом контракте, пополняется обычным переводом, approve не нужен.
 *         Награда резервируется при входе: вклады никогда не платят чужие награды,
 *         а если запас кончился, новые вклады не принимаются.
 *
 *         Выход раньше срока: без награды, штраф по той же лестнице, что и награда.
 *         30 дней после срока: вклад с наградой или продление.
 *         Позже: награда сгорает, вклад лежит без срока, пока человек его не заберёт.
 *         Штрафы и сгоревшие награды остаются в запасе; свободный остаток владелец может вывести.
 *
 *         Вклады и зарезервированные награды владельцу недоступны. Пауза останавливает
 *         только новые вклады и продление, выход открыт всегда. Контракт создаётся на паузе.
 *
 *         Контракт не обновляется: логику нельзя подменить или дописать. С NFT он не связан.
 */
contract IBITIStaking is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Closed, // вклад уже забран
        Locked, // срок не вышел
        Claimable, // срок вышел, окно открыто
        Expired // окно закрылось
    }

    struct StakeInfo {
        uint256 amount;
        uint256 reward; // зарезервированная награда; 0 после освобождения
        uint64 start;
        uint8 months;
    }

    uint8 public constant IBITI_DECIMALS = 8;
    uint256 public constant SECONDS_PER_MONTH = 30 days;
    uint256 public constant CLAIM_WINDOW = 30 days;

    IERC20 public immutable token;

    uint256 public minStake;
    uint256 public totalStaked;
    uint256 public reservedRewards;

    mapping(address => StakeInfo[]) private _stakes;
    mapping(address => uint256) public stakeOf;

    event Staked(address indexed user, uint256 indexed id, uint256 amount, uint256 months, uint256 reward);
    event Unstaked(address indexed user, uint256 indexed id, uint256 payout, uint256 reward, uint256 penalty);
    event Renewed(address indexed user, uint256 indexed oldId, uint256 indexed newId, uint256 refunded, uint256 topUp);
    event RewardReleased(address indexed user, uint256 indexed id, uint256 reward);
    event MinStakeUpdated(uint256 minStake);
    event FreeRewardsWithdrawn(address indexed to, uint256 amount);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error WrongDecimals(address token, uint8 decimals);
    error BadMonths(uint256 months);
    error BelowMinStake(uint256 amount, uint256 minStake);
    error RewardPoolExhausted(uint256 needed, uint256 available);
    error BadStakeId(uint256 id);
    error StakeClosed(uint256 id);
    error StakeStillLocked(uint256 id);
    error WindowNotClosed(uint256 id);
    error RewardAlreadyReleased(uint256 id);
    error ExceedsFreeRewards(uint256 amount, uint256 available);
    error RescueIbitiForbidden();
    error RenounceDisabled();

    constructor(address token_, address owner_, uint256 minStake_) {
        if (token_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (minStake_ == 0) revert ZeroAmount();
        uint8 dec = IERC20Metadata(token_).decimals();
        if (dec != IBITI_DECIMALS) revert WrongDecimals(token_, dec);

        token = IERC20(token_);
        minStake = minStake_;

        _transferOwnership(owner_);
        _pause();
    }

    // ======= Вклады =======

    /// @notice Новый вклад. Нужен approve на сумму вклада.
    function stake(uint256 amount, uint256 months) external nonReentrant whenNotPaused returns (uint256 id) {
        uint256 reward = _checkedReward(amount, months);
        uint256 free = freeRewards();
        if (reward > free) revert RewardPoolExhausted(reward, free);

        id = _book(msg.sender, amount, reward, months);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Забрать вклад. Сумма зависит от состояния вклада; пауза не мешает.
    function unstake(uint256 id) external nonReentrant {
        StakeInfo storage s = _openStake(msg.sender, id);
        Status st = _statusOf(s);
        uint256 amount = s.amount;
        uint256 reward = st == Status.Claimable ? s.reward : 0;
        uint256 penalty = st == Status.Locked ? (amount * rewardPercent(s.months)) / 100 : 0;

        _close(msg.sender, s);

        uint256 payout = amount + reward - penalty;
        token.safeTransfer(msg.sender, payout);

        emit Unstaked(msg.sender, id, payout, reward, penalty);
    }

    /**
     * @notice Продлить после срока: новый вклад на newAmount и months месяцев.
     *         В окне старая награда достаётся человеку, после окна в зачёт идёт только вклад.
     *         Лишнее возвращается на кошелёк, недостающее доплачивается с него (нужен approve на разницу).
     */
    function renew(uint256 id, uint256 newAmount, uint256 months) external nonReentrant whenNotPaused returns (uint256 newId) {
        StakeInfo storage s = _openStake(msg.sender, id);
        Status st = _statusOf(s);
        if (st == Status.Locked) revert StakeStillLocked(id);

        uint256 newReward = _checkedReward(newAmount, months);
        uint256 available = s.amount + (st == Status.Claimable ? s.reward : 0);

        _close(msg.sender, s);

        // После закрытия старого вклада available ещё лежит на контракте и его не считаем запасом
        uint256 free = freeRewards() - available;
        if (newReward > free) revert RewardPoolExhausted(newReward, free);

        newId = _book(msg.sender, newAmount, newReward, months);

        uint256 topUp = newAmount > available ? newAmount - available : 0;
        uint256 refunded = available > newAmount ? available - newAmount : 0;
        if (topUp != 0) token.safeTransferFrom(msg.sender, address(this), topUp);
        if (refunded != 0) token.safeTransfer(msg.sender, refunded);

        emit Renewed(msg.sender, id, newId, refunded, topUp);
    }

    /**
     * @notice После закрытия окна возвращает зарезервированную награду в запас.
     *         Вызвать может любой: вклад остаётся за человеком, вызвавший ничего не получает.
     */
    function releaseExpired(address user, uint256 id) external {
        StakeInfo storage s = _openStake(user, id);
        if (_statusOf(s) != Status.Expired) revert WindowNotClosed(id);
        uint256 reward = s.reward;
        if (reward == 0) revert RewardAlreadyReleased(id);

        s.reward = 0;
        reservedRewards -= reward;
        emit RewardReleased(user, id, reward);
    }

    // ======= Чтение =======

    /// @notice Сколько запаса свободно: не вклады и не обещанные награды.
    function freeRewards() public view returns (uint256) {
        return token.balanceOf(address(this)) - totalStaked - reservedRewards;
    }

    function stakeCount(address user) external view returns (uint256) {
        return _stakes[user].length;
    }

    function stakeInfo(address user, uint256 id) external view returns (StakeInfo memory) {
        if (id >= _stakes[user].length) revert BadStakeId(id);
        return _stakes[user][id];
    }

    function statusOf(address user, uint256 id) external view returns (Status) {
        if (id >= _stakes[user].length) revert BadStakeId(id);
        return _statusOf(_stakes[user][id]);
    }

    function maturityOf(address user, uint256 id) external view returns (uint256) {
        if (id >= _stakes[user].length) revert BadStakeId(id);
        return _maturity(_stakes[user][id]);
    }

    /// @notice Сколько человек получит, если заберёт вклад прямо сейчас.
    function quoteUnstake(address user, uint256 id) external view returns (uint256 payout, uint256 reward, uint256 penalty, Status status) {
        if (id >= _stakes[user].length) revert BadStakeId(id);
        StakeInfo storage s = _stakes[user][id];
        status = _statusOf(s);
        if (status == Status.Closed) return (0, 0, 0, status);
        reward = status == Status.Claimable ? s.reward : 0;
        penalty = status == Status.Locked ? (s.amount * rewardPercent(s.months)) / 100 : 0;
        payout = s.amount + reward - penalty;
    }

    function quoteReward(uint256 amount, uint256 months) external pure returns (uint256) {
        return (amount * rewardPercent(months)) / 100;
    }

    /// @notice Награда и штраф за срок, в процентах от вклада.
    function rewardPercent(uint256 months) public pure returns (uint256) {
        if (months == 1) return 1;
        if (months == 2) return 3;
        if (months == 3) return 5;
        if (months == 4) return 7;
        if (months == 5) return 10;
        if (months == 6) return 12;
        if (months == 7) return 14;
        if (months == 8) return 18;
        if (months == 9) return 20;
        if (months == 10) return 22;
        if (months == 11) return 25;
        if (months == 12) return 30;
        revert BadMonths(months);
    }

    // ======= Управление =======

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMinStake(uint256 minStake_) external onlyOwner whenPaused {
        if (minStake_ == 0) revert ZeroAmount();
        minStake = minStake_;
        emit MinStakeUpdated(minStake_);
    }

    /// @notice Вывести свободный остаток запаса. Вклады и обещанные награды недоступны.
    function withdrawFreeRewards(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 free = freeRewards();
        if (amount > free) revert ExceedsFreeRewards(amount, free);
        token.safeTransfer(to, amount);
        emit FreeRewardsWithdrawn(to, amount);
    }

    /// @notice Чужие токены, присланные по ошибке. IBITI этим способом не вывести.
    function rescueToken(address token_, address to, uint256 amount) external onlyOwner {
        if (token_ == address(token)) revert RescueIbitiForbidden();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token_).safeTransfer(to, amount);
        emit TokenRescued(token_, to, amount);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ======= Внутреннее =======

    function _checkedReward(uint256 amount, uint256 months) private view returns (uint256) {
        if (amount < minStake) revert BelowMinStake(amount, minStake);
        return (amount * rewardPercent(months)) / 100;
    }

    function _book(address user, uint256 amount, uint256 reward, uint256 months) private returns (uint256 id) {
        id = _stakes[user].length;
        _stakes[user].push(StakeInfo(amount, reward, uint64(block.timestamp), uint8(months)));
        totalStaked += amount;
        reservedRewards += reward;
        stakeOf[user] += amount;
        emit Staked(user, id, amount, months, reward);
    }

    function _close(address user, StakeInfo storage s) private {
        totalStaked -= s.amount;
        reservedRewards -= s.reward;
        stakeOf[user] -= s.amount;
        s.amount = 0;
        s.reward = 0;
    }

    function _openStake(address user, uint256 id) private view returns (StakeInfo storage s) {
        if (id >= _stakes[user].length) revert BadStakeId(id);
        s = _stakes[user][id];
        if (s.amount == 0) revert StakeClosed(id);
    }

    function _maturity(StakeInfo storage s) private view returns (uint256) {
        return uint256(s.start) + uint256(s.months) * SECONDS_PER_MONTH;
    }

    function _statusOf(StakeInfo storage s) private view returns (Status) {
        if (s.amount == 0) return Status.Closed;
        uint256 maturity = _maturity(s);
        if (block.timestamp < maturity) return Status.Locked;
        if (block.timestamp <= maturity + CLAIM_WINDOW) return Status.Claimable;
        return Status.Expired;
    }
}
