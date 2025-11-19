// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPancakeRouter {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

contract BuybackManager is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public ibiti;
    IERC20 public immutable paymentToken;
    IPancakeRouter public immutable router;
    address[] public path;

    /// @dev Максимальная длина пути свапа
    uint256 public constant MAX_PATH_LENGTH = 5;

    /// @dev Процент (0–100) купленных IBITI, который будет сожжён
    uint256 public burnPercent;
    address public immutable burnAddress;

    event BoughtBack(uint256 paidIn, uint256 boughtOut, uint256 burned);
    event WithdrawnPayment(address to, uint256 amount);
    event WithdrawnIBITI(address to, uint256 amount);
    event PathUpdated(address[] newPath);
    event BurnPercentUpdated(uint256 percent);
    event IbitiTokenUpdated(address newIbiti);

    constructor(
        address _ibiti,
        address _paymentToken,
        address _router,
        address[] memory _path,
        address _burnAddress,
        uint256 _initialBurnPercent
    ) {
        require(_ibiti != address(0), "BM: ibiti zero");
        require(_paymentToken != address(0), "BM: paymentToken zero");
        require(_router != address(0), "BM: router zero");
        require(_burnAddress != address(0), "BM: burnAddr zero");
        require(_path.length >= 2 && _path.length <= MAX_PATH_LENGTH, "BM: path length out of range");
        require(_path[0] == _paymentToken, "BM: wrong path start");
        require(_path[_path.length-1] == _ibiti, "BM: wrong path end");
        require(_initialBurnPercent <= 100, "BM: percent out of range");

        ibiti         = IERC20(_ibiti);
        paymentToken  = IERC20(_paymentToken);
        router        = IPancakeRouter(_router);
        path          = _path;
        burnAddress   = _burnAddress;
        burnPercent   = _initialBurnPercent;
    }

    /// @notice Депозит paymentToken на контракт для последующих выкупов
    function depositPayment(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "BM: zero amount");
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Выкупает pct% от баланса контракта и сжигает burnPercent% купленного.
     * @param pct процент от баланса paymentToken (0–100)
     * @param amountOutMin минимальный приемлемый объём IBITI (антислип)
     */
    function buybackPercent(uint256 pct, uint256 amountOutMin)
        external onlyOwner whenNotPaused nonReentrant
    {
        require(pct > 0 && pct <= 100, "BM: pct out of range");
        uint256 bal = paymentToken.balanceOf(address(this));
        require(bal > 0, "BM: no balance");
        uint256 amountIn = (bal * pct) / 100;

        _executeBuyback(amountIn, amountOutMin);
    }

    /**
     * @notice Выкуп всего баланса paymentToken и сжигает burnPercent% купленного.
     * @param amountOutMin минимальный приемлемый объём IBITI
     */
    function buybackAll(uint256 amountOutMin)
        external onlyOwner whenNotPaused nonReentrant
    {
        uint256 bal = paymentToken.balanceOf(address(this));
        require(bal > 0, "BM: no balance");
        _executeBuyback(bal, amountOutMin);
    }
       
       function rescueERC20(address token, address to, uint256 amount)
       external onlyOwner
    {
       require(token != address(ibiti), "BM: use withdrawIBITI");
       require(token != address(paymentToken), "BM: use withdrawPaymentToken");
       require(to != address(0), "BM: zero to");
       IERC20(token).safeTransfer(to, amount);
     }
      

    function _executeBuyback(uint256 amountIn, uint256 amountOutMin) internal {
        // обеспечить достаточный allowance без сброса
        uint256 currentAllowance = paymentToken.allowance(address(this), address(router));
        if (currentAllowance < amountIn) {
            paymentToken.safeIncreaseAllowance(address(router), amountIn - currentAllowance);
        }

        uint256 before = ibiti.balanceOf(address(this));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            block.timestamp
        );
        uint256 bought = ibiti.balanceOf(address(this)) - before;

        uint256 toBurn = (bought * burnPercent) / 100;
        if (toBurn > 0) {
            ibiti.safeTransfer(burnAddress, toBurn);
        }

        emit BoughtBack(amountIn, bought, toBurn);
    }

    /// @notice Изменить процент сжигания (0–100)
    function setBurnPercent(uint256 pct) external onlyOwner whenNotPaused {
        require(pct <= 100, "BM: percent out of range");
        burnPercent = pct;
        emit BurnPercentUpdated(pct);
    }

       function setIbitiToken(address newIbiti) external onlyOwner whenPaused {
       require(newIbiti != address(0), "BM: zero ibiti");
       // если у тебя есть публичный массив path, проверим его конец
       require(path.length >= 2, "BM: path not set");
       require(path[path.length - 1] == newIbiti, "BM: path end != new IBITI");
       ibiti = IERC20(newIbiti);
       emit IbitiTokenUpdated(newIbiti);
     }
       
       function setIbitiAndPath(address newIbiti, address[] calldata newPath)
       external onlyOwner whenPaused
     {
       require(newIbiti != address(0), "BM: zero ibiti");
       require(newPath.length >= 2, "BM: bad path");
       require(newPath[newPath.length - 1] == newIbiti, "BM: mismatch");
       ibiti = IERC20(newIbiti);
       path = newPath;
       emit IbitiTokenUpdated(newIbiti);
       emit PathUpdated(newPath);
     }

        /// @notice Обновить путь свапа
function setPath(address[] calldata newPath) external onlyOwner whenPaused {
    // базовая валидация: длина и концы
    require(newPath.length >= 2 && newPath.length <= MAX_PATH_LENGTH, "BM: path length out of range");
    require(newPath[0] == address(paymentToken),       "BM: wrong path start");
    require(newPath[newPath.length - 1] == address(ibiti), "BM: wrong path end");

    // дополнительные проверки каждого сегмента
    for (uint256 i = 1; i < newPath.length; i++) {
        address prev = newPath[i - 1];
        address curr = newPath[i];
        require(curr != address(0),   "BM: zero address in path");
        require(curr != prev,         "BM: duplicate path segment");
        // запрет простого кольца (A→B→A)
        if (i + 1 < newPath.length) {
            require(newPath[i + 1] != prev, "BM: invalid loop in path");
        }
    }

    // запрет любых повторов адресов в пути (чтобы избежать A→B→C→B→…)
    for (uint256 i = 0; i < newPath.length; i++) {
        for (uint256 j = i + 1; j < newPath.length; j++) {
            require(newPath[i] != newPath[j], "BM: duplicate address in path");
        }
    }

         path = newPath;
         emit PathUpdated(newPath);
    }

    /// @notice Owner withdraws deposited payment tokens (blocked on pause)
        function withdrawPaymentToken(address to, uint256 amount)
        external onlyOwner whenNotPaused nonReentrant
    {
        require(to != address(0), "BM: zero recipient");
        paymentToken.safeTransfer(to, amount);
        emit WithdrawnPayment(to, amount);
    }

    /// @notice Owner withdraws IBITI tokens from the contract (blocked on pause)
        function withdrawIBITI(address to, uint256 amount)
        external onlyOwner whenNotPaused nonReentrant
    {
        require(to != address(0), "BM: zero recipient");
        ibiti.safeTransfer(to, amount);
        emit WithdrawnIBITI(to, amount);
    }
        
        /// @notice Получить текущий маршрут свапа
        function getPath() external view returns (address[] memory) {
        return path;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
