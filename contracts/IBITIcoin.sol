// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseToken}          from "./BaseToken.sol";
import {FeeManager}         from "./FeeManager.sol";
import {UserStatusManager}  from "./UserStatusManager.sol";
import {BridgeManager}      from "./BridgeManager.sol";

import {Ownable}            from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard}    from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Pausable}           from "@openzeppelin/contracts/security/Pausable.sol";
import {SafeERC20, IERC20}  from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// ───────────────────── Interfaces ─────────────────────

interface IDAOModuleSimple {
    function createProposalSimple(string calldata description) external returns (bool);
    function voteProposal(uint256 id, bool support)        external returns (bool);
    function executeProposalSimple(uint256 id)             external returns (bool);
}

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80);
}

interface IStakingModule {
    function stakeTokensFor(address staker, uint256 amount, uint256 duration) external;
    function unstakeTokensFor(address staker, uint256 index)                         external;
}

interface INFTDiscount {
    function discountData(uint256 tokenId)
        external
        view
        returns (
            uint256 discountPercent,
            uint8   level,
            uint256 lastTransferTime,
            uint256 purchaseTime,
            bool    used,
            uint256 usageCount,
            uint256 lastUsageReset
        );

    function useDiscountFor(address user, uint256 tokenId) external;
    /// для уникального NFT-уровня Pandora (не сгорает автоматически)
    function usePandora(uint256 tokenId) external;
}

/**
 * @title IBITIcoin
 * @notice ERC20 с комиссиями, стейкинг‑/DAO‑прокси, batchTransfer,
 *         freeze‑логикой и гибкой покупкой.
 */
contract IBITIcoin is BaseToken, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /*----------------------------------------------------------*
     |  Constants & immutables                                |
     *----------------------------------------------------------*/
     uint256 public constant MAX_BATCH_TRANSFER = 100;
     uint8   public constant DECIMALS            = 8;
     uint256 internal constant PRICE_FACTOR       = 1e8;    // 10 ** DECIMALS
     /// Уровень Pandora в enum NFTLevel (не сгорает никогда)
     uint8   public constant PANDORA_LEVEL       = 4;
     uint256 public immutable totalSupplyCap;

    address public immutable founderWallet;
    address public immutable reserveWallet;

    /*----------------------------------------------------------*
     |  External modules (могут обновляться)                    |
     *----------------------------------------------------------*/
    FeeManager        public feeManager;
    UserStatusManager public userStatusManager;
    BridgeManager     public bridgeManager;
    address           public stakingModule;
    address           public daoModule;
    INFTDiscount      public nftDiscount;

    /*----------------------------------------------------------*
     |  Packed flags                                            |
     *----------------------------------------------------------*/
    struct Flags {
        bool burnEnabled;
        bool distributionEnabled;
        bool purchaseFeeEnabled;
        bool transferFeeEnabled;
        bool saleFeeEnabled;
        bool activityTrackingEnabled;
    }
    Flags private _f;

    /*----------------------------------------------------------*
     |  Fee & distribution                                      |
     *----------------------------------------------------------*/
    uint256 public burnPercentage;          // % токенов, сжигаемых при продаже
    address public distributionWallet;      // куда идёт распределение

    /*----------------------------------------------------------*
     |  DAO / governance                                        |
     *----------------------------------------------------------*/
    bool    public daoEnabled;
    address public daoWallet;
    uint256 public daoEnableTime;
    uint256 internal constant DAO_TRANSFER_DELAY = 7 days;

    /*----------------------------------------------------------*
     |  Account status / holding                                |
     *----------------------------------------------------------*/
    mapping(address => bool) public  frozenAccounts;
    mapping(address => bool) internal feeDisabledFor;
    mapping(address => bool) public  hasStaked;
    mapping(address => uint256) private holdingStartTime;

    /*----------------------------------------------------------*
     |  Funds & purchase settings                               |
     *----------------------------------------------------------*/
    uint256 public ownerFunds;                      // накопленные BNB
    mapping(address => bool)    public acceptedPayment;
    mapping(address => uint256) public coinPriceTokens;
    uint256 public coinPriceBNB;
    bool    public useOracle;
    uint256 public coinPriceUSD;
    IAggregatorV3 public priceFeed;

    /*----------------------------------------------------------*
     |  Events (оставлены без изменений)                        |
     *----------------------------------------------------------*/
    event FounderFeePaid(address indexed sender, uint256 amount);
    event BatchTransfer(address indexed sender, uint256 totalAmount);
    event ActivityTrackingSet(bool enabled);
    event AccountFrozen(address indexed account);
    event AccountUnfrozen(address indexed account);
    event BurnPercentageUpdated(uint256 burnPct);
    event DistributionEnabledUpdated(bool enabled);
    event PurchaseFeeEnabledUpdated(bool enabled);
    event TransferFeeEnabledUpdated(bool enabled);
    event SaleFeeEnabledUpdated(bool enabled);
    event DaoModuleUpdated(address indexed newDao);
    event DaoWalletSet(address indexed wallet);
    event DaoEnabled(bool enabled);
    event OwnershipSwitchedToDao(address indexed newOwner);
    event CoinPurchased(
        address indexed buyer,
        uint256 tokensBought,
        uint256 cost,
        address paymentToken
    );
    event CoinSold(
        address indexed seller,
        uint256 amount,
        uint256 payout,
        address paymentToken,
        uint256 nftId
    );

    /*----------------------------------------------------------*
     |  Constructor                                             |
     *----------------------------------------------------------*/
    constructor(
        string  memory name_,
        string  memory symbol_,
        address _founderWallet,
        address _reserveWallet,
        FeeManager        _feeManager,
        UserStatusManager _userStatusManager,
        BridgeManager     _bridgeManager,
        address _stakingModule,
        address _daoModule
    ) BaseToken(name_, symbol_) {
        if (_founderWallet == address(0) || _reserveWallet == address(0))
            revert();

        founderWallet     = _founderWallet;
        reserveWallet     = _reserveWallet;
        feeManager        = _feeManager;
        userStatusManager = _userStatusManager;
        bridgeManager     = _bridgeManager;
        stakingModule     = _stakingModule;
        daoModule         = _daoModule;
        nftDiscount       = INFTDiscount(address(0));

        totalSupplyCap = 100_000_000 * 10 ** decimals();
        uint256 reserveAmt = (totalSupplyCap * 20) / 100;
        _mint(reserveWallet, reserveAmt);
        _mint(founderWallet, totalSupplyCap - reserveAmt);

        burnPercentage = 50;
        _f = Flags({
            burnEnabled:             true,
            distributionEnabled:     true,
            purchaseFeeEnabled:      false,
            transferFeeEnabled:      false,
            saleFeeEnabled:          true,
            activityTrackingEnabled: false
        });
        distributionWallet = _founderWallet;

        // acceptedPayment: native BNB → false; USDT → true
        address usdt = 0x55d398326f99059fF775485246999027B3197955;
        acceptedPayment[address(0)] = true;
        acceptedPayment[usdt]       = true;
        coinPriceTokens[usdt]       = 100_000;
    }

    /*----------------------------------------------------------*
     |  Public getters for packed flags (сохраняют API)         |
     *----------------------------------------------------------*/
    function burnEnabled()             public view returns (bool) { return _f.burnEnabled; }
    function distributionEnabled()     public view returns (bool) { return _f.distributionEnabled; }
    function purchaseFeeEnabled()      public view returns (bool) { return _f.purchaseFeeEnabled; }
    function transferFeeEnabled()      public view returns (bool) { return _f.transferFeeEnabled; }
    function saleFeeEnabled()          public view returns (bool) { return _f.saleFeeEnabled; }
    function activityTrackingEnabled() public view returns (bool) { return _f.activityTrackingEnabled;
}

    /*─────────────────  Cap‑mint  ─────────────────*/
function _mint(address to, uint256 amt) internal override {
    if (totalSupply() + amt > totalSupplyCap) revert(); // cap
    super._mint(to, amt);
}

/*─────────────────  Pause  ─────────────────*/
function pause() external onlyOwner { _pause(); }
function unpause() external onlyOwner { _unpause(); }

/*─────────────────  Freeze  ─────────────────*/
function freezeAccount(address a)   external onlyOwner whenNotPaused { frozenAccounts[a] = true;  emit AccountFrozen(a); }
function unfreezeAccount(address a) external onlyOwner whenNotPaused { frozenAccounts[a] = false; emit AccountUnfrozen(a); }

/*─────────────────  Batch‑transfer  ─────────────────*/
function batchTransfer(address[] calldata r, uint256[] calldata v)
    external nonReentrant whenNotPaused returns (bool)
{
    uint256 len = r.length;
    if (len != v.length || len > MAX_BATCH_TRANSFER) revert();
    if (frozenAccounts[msg.sender])                  revert();

    uint256 tot;
    for (uint256 i; i < len; ) {
        address rcpt = r[i];
        if (frozenAccounts[rcpt]) revert();

        uint256 val = v[i];
        tot += val;

        // Вместо прямого _transfer — единая логика с проверками и комиссиями
        _doTransfer(msg.sender, rcpt, val, false);

        unchecked { ++i; }
    }
    emit BatchTransfer(msg.sender, tot);
    return true;
}

/*─────────────────  Holding‑tracking  ─────────────────*/
function _afterTokenTransfer(address from, address to, uint256 amt) internal override {
    super._afterTokenTransfer(from, to, amt);

    if (to != address(0)) {
        uint256 bal = balanceOf(to);
        uint256 prev = holdingStartTime[to];
        holdingStartTime[to] = prev == 0
            ? block.timestamp
            : ((bal - amt) * prev + amt * block.timestamp) / bal;
    }
    if (from != address(0) && balanceOf(from) == 0) holdingStartTime[from] = 0;
}
function getHoldingDuration(address u) external view returns (uint256) {
    return balanceOf(u) == 0 ? 0 : block.timestamp - holdingStartTime[u];
}
function decimals() public pure override returns (uint8) { return DECIMALS; }

/*─────────────────  Core transfer + fees  ─────────────────*/
function _doTransfer(address from, address to, uint256 amt, bool spendAllowance) internal returns (bool) {
    if (userStatusManager.isFlaggedBot(from)) revert();
    if (frozenAccounts[from] || frozenAccounts[to]) revert();

    if (!_f.transferFeeEnabled || from == stakingModule || feeDisabledFor[from]) {
        if (spendAllowance) _spendAllowance(from, msg.sender, amt);
        _transfer(from, to, amt);
        return true;
    }

    uint256 holdDur  = block.timestamp - holdingStartTime[from];
    uint256 feeAmt   = feeManager.calculateFee(
        from,
        amt,
        /*isSell*/ false,
        hasStaked[from],
        userStatusManager.isVIPUser(from),
        userStatusManager.isWhale(from),
        holdDur,
        0
    );
    if (feeAmt > amt) feeAmt = amt;

    if (feeAmt > 0) {
        if (spendAllowance) _spendAllowance(from, msg.sender, amt);
        _transfer(from, address(this), feeAmt);

        uint256 burnAmt = _f.burnEnabled ? feeAmt * burnPercentage / 100 : 0;
        if (burnAmt > 0) _burn(address(this), burnAmt);

        uint256 rem = feeAmt - burnAmt;
        if (_f.distributionEnabled && distributionWallet != address(0) && rem > 0) {
            _transfer(address(this), distributionWallet, rem);
        }
        emit FounderFeePaid(from, feeAmt);
        _transfer(from, to, amt - feeAmt);
    } else {
        if (spendAllowance) _spendAllowance(from, msg.sender, amt);
        _transfer(from, to, amt);
    }

    if (_f.activityTrackingEnabled) {
        feeManager.updateActivity(from, amt, /*isSell*/ false);
    }
    return true;
}

/* Public wrappers */
function transfer(address to, uint256 amt) public override whenNotPaused nonReentrant returns (bool) {
    return _doTransfer(msg.sender, to, amt, false);
}
function transferFrom(address f, address t, uint256 amt) public override whenNotPaused nonReentrant returns (bool) {
    return _doTransfer(f, t, amt, true);
}

    /*───────────────  Staking proxy  ───────────────*/
function stakeTokens(uint256 amt, uint256 dur) external nonReentrant whenNotPaused {
    feeDisabledFor[msg.sender] = true;
    IStakingModule(stakingModule).stakeTokensFor(msg.sender, amt, dur);
    feeDisabledFor[msg.sender] = false;
    hasStaked[msg.sender]      = true;
}

function unstakeTokens() external nonReentrant whenNotPaused {
    feeDisabledFor[msg.sender] = true;
    IStakingModule(stakingModule).unstakeTokensFor(msg.sender, 0);
    feeDisabledFor[msg.sender] = false;
    hasStaked[msg.sender]      = false;
}

/*───────────────  DAO proxy  ───────────────*/
function createProposalSimple(string calldata d) external whenNotPaused nonReentrant {
    if (daoModule == address(0)) return;
    if (!IDAOModuleSimple(daoModule).createProposalSimple(d)) revert();
}

function voteProposal(uint256 id, bool sup) external whenNotPaused nonReentrant {
    if (daoModule == address(0)) return;
    if (!IDAOModuleSimple(daoModule).voteProposal(id, sup)) revert();
}

function executeProposalSimple(uint256 id) external whenNotPaused nonReentrant {
    if (daoModule == address(0)) return;
    if (!IDAOModuleSimple(daoModule).executeProposalSimple(id)) revert();
}

/*───────────────  Bridge proxy  ───────────────*/
function bridgeMint(address to, uint256 amt) external whenNotPaused nonReentrant {
    if (!bridgeManager.isTrustedBridge(msg.sender)) revert();
    bridgeManager.checkAndUpdateBridgeMint(amt);
    _mint(to, amt);
}

function bridgeBurn(address from, uint256 amt) external whenNotPaused nonReentrant {
    if (!bridgeManager.isTrustedBridge(msg.sender)) revert();
    bridgeManager.checkAndUpdateBridgeBurn(amt);
    _burn(from, amt);
}

/*───────────────  Price helper  ───────────────*/
function _getEffectivePriceBNB() internal view returns (uint256) {
        if (useOracle) {
            if (coinPriceUSD == 0) revert();
            (, int256 p, , , ) = priceFeed.latestRoundData();
            if (p <= 0) revert();
            return (coinPriceUSD * 1e26) / (uint256(p) * 10 ** DECIMALS);
        }
        return coinPriceBNB;
    }

    /*─────────────────  Fee helper  ─────────────────*/
function _chargeFee(address usr, uint256 amt, bool isBuy) internal returns (uint256 fee) {
    if (feeDisabledFor[usr])                                   return 0;
    if (isBuy ? !_f.purchaseFeeEnabled : !_f.saleFeeEnabled)    return 0;

    uint256 hold = block.timestamp - holdingStartTime[usr];
    fee = feeManager.calculateFee(
        usr,
        amt,
        isBuy,
        hasStaked[usr],
        userStatusManager.isVIPUser(usr),
        userStatusManager.isWhale(usr),
        hold,
        0
    );
    if (fee > amt) fee = amt;
    ownerFunds += fee;           // учёт комиссий
}

  /* Purchases: native BNB */
function purchaseCoinBNB() external payable nonReentrant whenNotPaused {
    if (!acceptedPayment[address(0)]) revert();
    uint256 price = _getEffectivePriceBNB();
    if (msg.value < price) revert();

    uint256 tokensWhole = msg.value / price;
    uint256 gross       = tokensWhole * 10**DECIMALS;
    if (balanceOf(reserveWallet) < gross) revert();

    _transfer(reserveWallet, msg.sender, gross);

    uint256 spent  = tokensWhole * price;
    uint256 refund = msg.value - spent;
    if (refund > 0) {
        (bool ok,) = payable(msg.sender).call{value: refund}(""); 
        if (!ok) revert();
    }

    ownerFunds += spent;
    emit CoinPurchased(msg.sender, gross, spent, address(0));
    if (_f.activityTrackingEnabled) 
        feeManager.updateActivity(msg.sender, gross, false);
}

/* Purchases: ERC-20 */
function purchaseCoinToken(address payTok, uint256 amt)
    external nonReentrant whenNotPaused returns (bool)
{
    if (!acceptedPayment[payTok]) revert();
    uint256 raw = coinPriceTokens[payTok];
    if (raw == 0) revert();
    uint256 p    = raw < PRICE_FACTOR ? raw * PRICE_FACTOR : raw;
    uint256 cost = (p * amt) / PRICE_FACTOR;

    IERC20(payTok).safeTransferFrom(msg.sender, address(this), cost);
    if (balanceOf(reserveWallet) < amt) revert();

    _transfer(reserveWallet, msg.sender, amt);

    emit CoinPurchased(msg.sender, amt, cost, payTok);
    if (_f.activityTrackingEnabled) 
        feeManager.updateActivity(msg.sender, amt, false);
    return true;
}

     /// Вспомогательная общая логика продажи для BNB или ERC20
function _sell(address p,uint256 a,uint256 id) internal returns(uint256 n){
    if(a==0||!acceptedPayment[p]) revert();
    uint256 g = p==address(0)
        ? a*_getEffectivePriceBNB()/PRICE_FACTOR
        : ((coinPriceTokens[p]<PRICE_FACTOR?coinPriceTokens[p]*PRICE_FACTOR:coinPriceTokens[p]) * a) / PRICE_FACTOR;
    if(p==address(0)?address(this).balance<g:IERC20(p).balanceOf(address(this))<g) revert();
    _transfer(msg.sender,reserveWallet,a);

    uint256 ft = feeManager.calculateFee(
        msg.sender,a,false,
        hasStaked[msg.sender],
        userStatusManager.isVIPUser(msg.sender),
        userStatusManager.isWhale(msg.sender),
        block.timestamp-holdingStartTime[msg.sender],
        0
    );
    if(ft>a) ft=a;                       // защита от переполнения

    uint256 fee = g*ft/a;                // конвертируем комиссию из IBI-токенов в платёжный токен

    if(address(nftDiscount)!=address(0)){
        (uint256 d,uint8 lvl,,uint256 t,,,) = nftDiscount.discountData(id);
        if(t!=0){
            if(lvl==PANDORA_LEVEL) nftDiscount.usePandora(id);
            else nftDiscount.useDiscountFor(msg.sender,id);
            fee = fee*(100-d)/100;       // d % скидка по NFT
        }
    }

    ownerFunds += fee;
    n = g - fee;
}

/*──────────────  Sell for native BNB  ─────────────*/
function sellCoinBNB(uint256 a,uint256 id) external nonReentrant whenNotPaused returns(bool){
    uint256 n = _sell(address(0),a,id);
    (bool ok,)=payable(msg.sender).call{value:n}(""); if(!ok) revert();
    emit CoinSold(msg.sender,a,n,address(0),id);
    return true;
}

/*──────────────  Sell for ERC-20 token  ─────────────*/
function sellCoinToken(address p,uint256 a,uint256 id) external nonReentrant whenNotPaused returns(bool){
    uint256 n = _sell(p,a,id);
    IERC20(p).safeTransfer(msg.sender,n);
    emit CoinSold(msg.sender,a,n,p,id);
    return true;
}
    
    /*────────────────  Owner withdrawal  ────────────────*/
function withdrawOwnerFunds() external onlyOwner nonReentrant whenNotPaused {
    uint256 amt = ownerFunds;
    if (amt == 0) revert();          // no funds
    ownerFunds = 0;
    (bool ok, ) = payable(msg.sender).call{value: amt}("");
    if (!ok) revert();            // send failed
}

   // ──────────────── Admin Setters ────────────────

function setAcceptedPayment(address t, bool v) external onlyOwner whenNotPaused {
    acceptedPayment[t] = v;
}

function setCoinPriceToken(address t, uint256 p) external onlyOwner whenNotPaused {
    coinPriceTokens[t] = p;
}

function setUseOracle(bool v)        external onlyOwner whenNotPaused { useOracle    = v; }
function setCoinPriceUSD(uint256 v)  external onlyOwner whenNotPaused { coinPriceUSD = v; }
function setCoinPriceBNB(uint256 v)  external onlyOwner whenNotPaused { coinPriceBNB = v; }

function setDistributionWallet(address w) external onlyOwner whenNotPaused {
    if (w == address(0)) revert();
    distributionWallet = w;
}

function setPriceFeed(address f) external onlyOwner whenNotPaused {
    if (f == address(0)) revert();
    priceFeed = IAggregatorV3(f);
}

function setFeeManager(address a) external onlyOwner whenNotPaused {
    if (a == address(0)) revert();
    feeManager = FeeManager(a);
}

function setUserStatusManager(address a) external onlyOwner whenNotPaused {
    if (a == address(0)) revert();
    userStatusManager = UserStatusManager(a);
}

function setBridgeManager(address a) external onlyOwner whenNotPaused {
    if (a == address(0)) revert();
    bridgeManager = BridgeManager(a);
}

function setStakingModule(address a) external onlyOwner whenNotPaused {
    if (a == address(0)) revert();
    stakingModule = a;
}

function setDaoModule(address a) external onlyOwner whenNotPaused {
    if (a == address(0)) revert();
    daoModule = a;
    emit DaoModuleUpdated(a);
}

function setNFTDiscount(address a) external onlyOwner whenNotPaused {
    if (a == address(0)) revert();
    nftDiscount = INFTDiscount(a);
}

function setFlags(bool b, bool d, bool pf, bool tf, bool sf, bool at)
    external onlyOwner whenNotPaused
{
    _f = Flags(b, d, pf, tf, sf, at);
}

/*────────────────  Fee / flag setters  ────────────────*/
function setDistributionEnabled(bool e)    external onlyOwner whenNotPaused { _f.distributionEnabled     = e; emit DistributionEnabledUpdated(e); }
function setPurchaseFeeEnabled(bool e)     external onlyOwner whenNotPaused { _f.purchaseFeeEnabled      = e; emit PurchaseFeeEnabledUpdated(e);  }
function setTransferFeeEnabled(bool e)     external onlyOwner whenNotPaused { _f.transferFeeEnabled      = e; emit TransferFeeEnabledUpdated(e);  }
function setSaleFeeEnabled(bool e)         external onlyOwner whenNotPaused { _f.saleFeeEnabled          = e; emit SaleFeeEnabledUpdated(e); }
function setActivityTracking(bool e)       external onlyOwner whenNotPaused { _f.activityTrackingEnabled = e; emit ActivityTrackingSet(e);        }
function setBurnEnabled(bool e)            external onlyOwner whenNotPaused { _f.burnEnabled             = e; }

function setBurnPercentage(uint256 pct)    external onlyOwner whenNotPaused {
    if (pct > 100) revert();
    burnPercentage = pct;
    emit BurnPercentageUpdated(pct);
}

function setFeeDisabled(address u, bool d) external onlyOwner whenNotPaused { feeDisabledFor[u] = d; }

/*────────────────  DAO hand‑over control  ─────────────*/
function setDaoWallet(address w) external onlyOwner whenNotPaused {
    if (w == address(0)) revert();
    daoWallet = w;
    emit DaoWalletSet(w);
}

function enableDAO(bool en) external onlyOwner whenNotPaused {
    daoEnabled = en;
    if (en) daoEnableTime = block.timestamp;
    emit DaoEnabled(en);
}

function switchOwnershipToDao() external onlyOwner whenNotPaused {
    if (!daoEnabled)                          revert();
    if (daoWallet == address(0))              revert();
    if (block.timestamp < daoEnableTime + DAO_TRANSFER_DELAY) revert();
    transferOwnership(daoWallet);
    emit OwnershipSwitchedToDao(daoWallet);
}

/*────────────────  Rescue functions  ────────────────*/
event ERC20Rescued(address indexed token, address indexed to, uint256 amount);
function rescueERC20(address token, address to, uint256 amt) external onlyOwner nonReentrant {
    if (token == address(0) || to == address(0)) revert();
    IERC20(token).safeTransfer(to, amt);
    emit ERC20Rescued(token, to, amt);
}

event ETHRescued(address indexed to, uint256 amount);
function rescueETH(address payable to) external onlyOwner nonReentrant {
    if (to == address(0)) revert();
    uint256 bal = address(this).balance;
    to.transfer(bal);
    emit ETHRescued(to, bal);
}

   /*───────── ETH receivers ─────────*/
    receive() external payable {}
    fallback() external payable {}
}
