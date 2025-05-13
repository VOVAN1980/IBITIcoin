// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title BridgeManager
 * @notice Manages cross-chain bridge configurations with pause, DAO control, and efficient list operations.
 */
contract BridgeManager is Ownable, Pausable {
    struct BridgeInfo {
        bool trusted;
        bool active;
        bytes32 bridgeType;
        uint256 limit;       // Лимит токенов на мосту
        string description;
    }

    mapping(address => BridgeInfo) public bridges;
    address[] public bridgeList;
    mapping(address => uint256) private indexInList; // index+1, zero = не в списке

    // Суммарное число чеканок по каждому мосту
    mapping(address => uint256) public mintedAmount;

    /// Максимальный размер батча для batchSetBridgeInfo
    uint256 public constant MAX_BRIDGE_BATCH = 50;
    /// Lifetime-лимит по умолчанию для каждого нового моста (1 000 000 IBI, 8 дес. знаков)
   uint256 public constant DEFAULT_LIMIT = 1_000_000 * 10**8;

    address public router;

    address public governance;
    bool public governanceEnabled;

    bool public daoEnabled;
    address public daoWallet;

    event BridgeAdded(address indexed bridge);
    event BridgeSet(address indexed bridge, bool trusted, bool active);
    event BridgeInfoUpdated(address indexed bridge, bytes32 bridgeType, uint256 limit, string description);
    event BridgeRemoved(address indexed bridge);
    event BridgePaused(bool paused);
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event GovernanceEnabled(address indexed governance, bool enabled);
    event DaoSettingsUpdated(bool daoEnabled, address daoWallet);
    event OwnershipSwitchedToDao(address newOwner);

    modifier onlyController() {
        if (governanceEnabled) {
            require(msg.sender == governance, "Only governance");
        } else {
            require(msg.sender == owner(), "Only owner");
        }
        _;
    }

    /// @notice Добавить или обновить мост (trusted + active = status)
    function setBridge(address bridge, bool status)
        external
        onlyController
        whenNotPaused
    {
        require(bridge != address(0), "Invalid bridge");
        if (!_bridgeExists(bridge)) {
           bridgeList.push(bridge);
           indexInList[bridge] = bridgeList.length;
           // по умолчанию даём мосту лимит 1 000 000 IBI
           bridges[bridge].limit = DEFAULT_LIMIT;
           emit BridgeAdded(bridge);
       }        
        bridges[bridge].trusted = status;
        bridges[bridge].active  = status;
        emit BridgeSet(bridge, status, status);
    }

    /// @notice Установить подробную информацию по мосту
    function setBridgeInfo(
        address bridge,
        bool    trusted,
        bool    active,
        bytes32 bridgeType,
        uint256 limit,
        string calldata description
    )
        public
        onlyController
        whenNotPaused
    {
        require(bridge != address(0), "Invalid bridge");
        if (!_bridgeExists(bridge)) {
            bridgeList.push(bridge);
            indexInList[bridge] = bridgeList.length;
            emit BridgeAdded(bridge);
        }
        bridges[bridge] = BridgeInfo(trusted, active, bridgeType, limit, description);
        emit BridgeInfoUpdated(bridge, bridgeType, limit, description);
    }

    /// @notice Пакетное обновление нескольких мостов
    function batchSetBridgeInfo(
        address[] calldata bridgesAddresses,
        bool[]    calldata trusted,
        bool[]    calldata active,
        bytes32[] calldata bridgeTypes,
        uint256[] calldata limits,
        string[]  calldata descriptions
    )
        external
        onlyController
        whenNotPaused
    {
        uint256 n = bridgesAddresses.length;
        require(n <= MAX_BRIDGE_BATCH, "Batch too large");
        require(
            n == trusted.length &&
            n == active.length &&
            n == bridgeTypes.length &&
            n == limits.length &&
            n == descriptions.length,
            "Array length mismatch"
        );
        for (uint256 i = 0; i < n; i++) {
            setBridgeInfo(
                bridgesAddresses[i],
                trusted[i],
                active[i],
                bridgeTypes[i],
                limits[i],
                descriptions[i]
            );
        }
    }

    /// @notice Удалить мост (сбросить данные и mintedAmount)
    function removeBridge(address bridge)
        external
        onlyController
        whenNotPaused
    {
        require(_bridgeExists(bridge), "Bridge not present");
        delete bridges[bridge];
        mintedAmount[bridge] = 0;
        _removeBridgeFromList(bridge);
        emit BridgeRemoved(bridge);
    }

    /// @notice Проверка, что мост и активен, и доверен
    function isTrustedBridge(address bridge) external view returns (bool) {
        BridgeInfo memory info = bridges[bridge];
        return info.trusted && info.active;
    }

    /// @notice Обновить адрес маршрутизатора
    function setRouter(address newRouter)
        external
        onlyController
        whenNotPaused
    {
        address old = router;
        router = newRouter;
        emit RouterUpdated(old, newRouter);
    }

    /// @notice Поставить контракт на паузу или снять паузу
    function setBridgePaused(bool paused)
        external
        onlyController
    {
        if (paused) _pause();
        else        _unpause();
        emit BridgePaused(paused);
    }

    /// @notice Включить DAO-контролируемое управление (разрешает onlyController = governance)
    function setGovernance(address _governance, bool enabled)
        external
        onlyOwner
        whenNotPaused
    {
        require(!governanceEnabled, "Governance already set");
        governance        = _governance;
        governanceEnabled = enabled;
        emit GovernanceEnabled(_governance, enabled);
    }

    /// @notice Настройки DAO (включить/выключить, указать кошелёк)
    function setDaoSettings(bool _daoEnabled, address _daoWallet)
        external
        onlyOwner
        whenNotPaused
    {
        require(!_daoEnabled || _daoWallet != address(0), "Invalid DAO wallet");
        daoEnabled = _daoEnabled;
        daoWallet  = _daoWallet;
        emit DaoSettingsUpdated(_daoEnabled, _daoWallet);
    }

    /// @notice Передать владение контрактом на DAO-кошелёк после enable
    function switchOwnershipToDao()
        external
        onlyOwner
        whenNotPaused
    {
        require(daoEnabled,         "DAO mode disabled");
        require(daoWallet != address(0), "DAO wallet not set");
        transferOwnership(daoWallet);
        emit OwnershipSwitchedToDao(daoWallet);
    }

    /// @notice Обновить счётчик mint для msg.sender-моста
    function checkAndUpdateBridgeMint(uint256 amount)
        external
        whenNotPaused
    {
        require(_bridgeExists(msg.sender), "Bridge not present");
        uint256 total = mintedAmount[msg.sender] + amount;
        require(total <= bridges[msg.sender].limit, "Bridge mint limit exceeded");
        mintedAmount[msg.sender] = total;
    }

    /// @notice Обновить счётчик burn для msg.sender-моста
    function checkAndUpdateBridgeBurn(uint256 amount)
        external
        whenNotPaused
    {
        require(_bridgeExists(msg.sender), "Bridge not present");
        uint256 current = mintedAmount[msg.sender];
        require(current >= amount, "Bridge burn: amount exceeds minted");
        mintedAmount[msg.sender] = current - amount;
    }

    /// @notice Proxy-версия mint-апдейта от лица указанного моста
    function checkAndUpdateBridgeMintBy(address bridge, uint256 amount)
        external
        whenNotPaused
        onlyController
    {
        require(_bridgeExists(bridge), "Bridge not present");
        uint256 total = mintedAmount[bridge] + amount;
        require(total <= bridges[bridge].limit, "Bridge mint limit exceeded");
        mintedAmount[bridge] = total;
    }

    /// @notice Proxy-версия burn-апдейта от лица указанного моста
    function checkAndUpdateBridgeBurnBy(address bridge, uint256 amount)
        external
        whenNotPaused
        onlyController
    {
        require(_bridgeExists(bridge), "Bridge not present");
        uint256 current = mintedAmount[bridge];
        require(current >= amount, "Bridge burn: amount exceeds minted");
        mintedAmount[bridge] = current - amount;
    }

    // === Внутренние хелперы ===

    function _bridgeExists(address bridge) internal view returns (bool) {
        return indexInList[bridge] != 0;
    }

    function _removeBridgeFromList(address bridge) internal {
        uint256 idx = indexInList[bridge];
        if (idx == 0) return;  // не в списке
        uint256 last = bridgeList.length;
        if (idx < last) {
            address swapBridge = bridgeList[last - 1];
            bridgeList[idx - 1] = swapBridge;
            indexInList[swapBridge] = idx;
        }
        bridgeList.pop();
        indexInList[bridge] = 0;
    }
}
