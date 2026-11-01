// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title IBITIVesting
 * @notice Хранит долю команды. Токены лежат здесь, пока владелец не выдаст их членам команды.
 *
 *         График один на всю долю и не меняется (как в whitepaper):
 *           - 20% открываются на старте;
 *           - ещё 30% через 180 дней;
 *           - последние 50% равномерно за 180 дней после 3 лет (1095 дней).
 *
 *         Выдать может только владелец, только на адрес из списка команды и только то,
 *         что уже открылось по графику. Токен, доля и старт задаются один раз.
 *         От владения отказаться нельзя: иначе токены застрянут здесь навсегда.
 *         Передача владельца — в два шага, новый адрес подтверждает её сам.
 */
contract IBITIVesting is Ownable2Step {
    using SafeERC20 for IERC20;

    uint64 public constant SECOND_TRANCHE_DELAY = 180 days;
    uint64 public constant FINAL_CLIFF = 1095 days;
    uint64 public constant FINAL_DURATION = 180 days;

    IERC20 public immutable token;
    uint256 public immutable totalAllocation;
    uint64 public immutable start;

    uint256 public released;
    mapping(address => bool) public isMember;

    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event Released(address indexed member, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error NotMember(address account);
    error ExceedsAvailable(uint256 requested, uint256 available);
    error RenounceDisabled();

    constructor(address token_, address owner_, uint256 totalAllocation_, uint64 start_) {
        if (token_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (totalAllocation_ == 0) revert ZeroAmount();
        token = IERC20(token_);
        totalAllocation = totalAllocation_;
        start = start_;
        _transferOwnership(owner_);
    }

    /// @notice Сколько всего открыто по графику на указанный момент (вместе с уже выданным).
    function unlockedAt(uint64 timestamp) public view returns (uint256) {
        if (timestamp < start) return 0;
        uint256 elapsed = timestamp - start;
        if (elapsed < SECOND_TRANCHE_DELAY) return (totalAllocation * 20) / 100;

        uint256 half = (totalAllocation * 50) / 100;
        if (elapsed < FINAL_CLIFF) return half;

        uint256 sinceCliff = elapsed - FINAL_CLIFF;
        if (sinceCliff >= FINAL_DURATION) return totalAllocation;
        return half + ((totalAllocation - half) * sinceCliff) / FINAL_DURATION;
    }

    /// @notice Сколько можно выдать прямо сейчас.
    function available() public view returns (uint256) {
        return unlockedAt(uint64(block.timestamp)) - released;
    }

    function addMember(address member) external onlyOwner {
        if (member == address(0)) revert ZeroAddress();
        isMember[member] = true;
        emit MemberAdded(member);
    }

    function removeMember(address member) external onlyOwner {
        isMember[member] = false;
        emit MemberRemoved(member);
    }

    function release(address member, uint256 amount) external onlyOwner {
        if (!isMember[member]) revert NotMember(member);
        if (amount == 0) revert ZeroAmount();
        uint256 open = available();
        if (amount > open) revert ExceedsAvailable(amount, open);

        released += amount;
        token.safeTransfer(member, amount);
        emit Released(member, amount);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }
}
