// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/// @title TeamVesting
/// @notice Вестинг-контракт для команды: 
/// - 20% сразу после старта, 
/// - 30% через 6 месяцев, 
/// - 50% линейно в течение 6 месяцев после 3‑летнего клиффа.
contract TeamVesting is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public beneficiary;

    uint256 public immutable totalAllocation;
    uint256 public immutable start;
    uint256 public released;
    uint256 public deposited;

    uint256 private constant IMMEDIATE_PCT   = 20;        // 20%
    uint256 private constant SIX_MONTHS_PCT  = 30;        // 30%
    uint256 private constant LINEAR_PCT      = 50;        // 50%
    uint256 private constant SIX_MONTHS      = 180 days;
    uint256 private constant THREE_YEARS     = 3 * 365 days;
    uint256 private constant LINEAR_PERIOD   = 180 days;

    event TokenAddressSet(address indexed token);
    event BeneficiaryUpdated(address indexed beneficiary);
    event TokensDeposited(uint256 amount);
    event Released(uint256 amount);

    constructor(
        uint256 _totalAllocation,
        uint256 _start,
        address _beneficiary
    ) {
        require(_totalAllocation > 0, "Allocation zero");
        require(_beneficiary != address(0), "Beneficiary zero");

        totalAllocation = _totalAllocation;
        start           = _start;
        beneficiary     = _beneficiary;
    }

    function setTokenAddress(IERC20 _token) external onlyOwner {
        require(address(_token) != address(0), "Token zero");
        token = _token;
        emit TokenAddressSet(address(_token));
    }

    function setBeneficiary(address _beneficiary) external onlyOwner {
        require(_beneficiary != address(0), "Beneficiary zero");
        beneficiary = _beneficiary;
        emit BeneficiaryUpdated(_beneficiary);
    }

    function depositTokens(uint256 amount) external onlyOwner nonReentrant {
        require(address(token) != address(0), "Token not set");
        require(deposited + amount <= totalAllocation, "Exceeds allocation");

        deposited += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit TokensDeposited(amount);
    }

    /// @notice Сколько токенов доступно к выпуску (view).
    function releasableAmount() public view returns (uint256) {
        uint256 vested = _vestedAt(block.timestamp);
        if (vested > totalAllocation) vested = totalAllocation;
        return vested - released;
    }

    /// @notice Выпускает токены бенефициару.
    function release() external whenNotPaused nonReentrant {
        require(address(token) != address(0), "Token not set");

        // учитываем сдвиг таймстампа транзакции
        uint256 vested = _vestedAt(_txTimestamp());
        if (vested > totalAllocation) vested = totalAllocation;

        uint256 amount = vested - released;
        require(amount > 0, "No tokens due");

        released += amount;
        token.safeTransfer(beneficiary, amount);
        emit Released(amount);
    }

    /// @notice Выпускает токены на указанный адрес.
    function releaseTo(address to) external onlyOwner whenNotPaused nonReentrant {
        require(address(token) != address(0), "Token not set");
        require(to != address(0), "Recipient zero");

        uint256 vested = _vestedAt(_txTimestamp());
        if (vested > totalAllocation) vested = totalAllocation;

        uint256 amount = vested - released;
        require(amount > 0, "No tokens due");

        released += amount;
        token.safeTransfer(to, amount);
        emit Released(amount);
    }

    /// @notice Возвращает данные по вестингу.
    function getVestingInfo()
        external
        view
        returns (
            uint256 totalVested,
            uint256 locked,
            uint256 pending
        )
    {
        uint256 vested = _vestedAt(block.timestamp);
        if (vested > totalAllocation) vested = totalAllocation;

        totalVested = vested;
        locked      = totalAllocation - vested;
        pending     = vested - released;
    }

    /// @dev Вспомогательная: рассчитывает, сколько всего уже вестировано к моменту `timestamp`.
    function _vestedAt(uint256 timestamp) internal view returns (uint256) {
        if (timestamp < start) {
            return 0;
        }

        uint256 vested = (totalAllocation * IMMEDIATE_PCT) / 100;

        if (timestamp >= start + SIX_MONTHS) {
            vested += (totalAllocation * SIX_MONTHS_PCT) / 100;
        }

        if (timestamp >= start + THREE_YEARS) {
            uint256 cliffEnd   = start + THREE_YEARS;
            uint256 vestAmount = (totalAllocation * LINEAR_PCT) / 100;

            if (timestamp >= cliffEnd + LINEAR_PERIOD) {
                vested += vestAmount;
            } else {
                uint256 elapsed = timestamp - cliffEnd;
                vested += (vestAmount * elapsed) / LINEAR_PERIOD;
            }
        }

        return vested;
    }

    /// @dev Таймстамп, учитывающий автоминт блока при транзакции.
    function _txTimestamp() internal view returns (uint256) {
        // если это транзакция, в которой block.timestamp уже +1,
        // то берём прошлую секунду
        return block.timestamp > start ? block.timestamp - 1 : block.timestamp;
    }
}
