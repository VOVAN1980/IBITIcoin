// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./NFTDiscount.sol";

/**
 * @title DAOModule
 * @notice On‑chain DAO с подтверждением участия в каждом голосовании (opt‑in).
 */
abstract contract DAOModule is Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant VOTE_THRESHOLD = 100;

    struct Proposal {
        address proposer;
        string description;
        bool executed;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 endTime;
        bool rewardsIssued;
    }

    Proposal[] public proposals;

    // --- Голосование ---
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public voteChoice;
    mapping(uint256 => address[]) public proposalVoters;

    // --- Регистрация в DAO (единожды) ---
    mapping(address => bool) public eligibleVoters;
    uint256 public totalRegisteredVoters;

    // --- Opt‑in для каждого раунда голосования ---
    mapping(uint256 => mapping(address => bool)) public hasOptedIn;
    mapping(uint256 => uint256) public optedInCount;
    /// Максимальное число участников одного голосования
    uint256 public constant MAX_VOTERS_PER_PROPOSAL = 500;

    // --- Параметры голосования ---
    uint256 public minVotingPeriod = 1 days;
    uint256 public maxVotingPeriod = 7 days;
    uint256 public quorumPercent   = 51;      // % от числа подтвердивших opt‑in
    uint256 public votingTimelock  = 1 days;  // после конца раунда

    // --- Награды NFT ---
    string public votingRewardBaseURI = "ipfs://votingRewardsMetadata";
    uint256 public lastVotingRewardTime;      // не чаще чем раз в 30 дней

    // --- События ---
    event ProposalCreated(uint256 indexed id, address indexed proposer, string description, uint256 endTime);
    event VoterRegistered(address indexed user);
    event OptedIn(uint256 indexed proposalId, address indexed voter);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId, bool success);
    event NFTRewardsIssued(uint256 proposalId, address[] winners, address[] losers);
    // @notice Сигнализирует, что выдача наград не удалась
    event NFTRewardsFailed(uint256 proposalId);
    event NFTRewardAwarded(address indexed recipient, uint256 discountPercent, string tokenURI);
    event VotingTimelockUpdated(uint256 newTimelock);
    event VotingRewardBaseURIUpdated(string newBaseURI);

    /// @notice Получить токен (для порога) — реализуется в наследнике
    function getToken() public view virtual returns (ERC20);

    /// @notice NFTDiscount для выдачи наград — реализуется в наследнике
    function getNFTDiscount() public view virtual returns (NFTDiscount);

    modifier onlyEligibleVoter() {
        if (msg.sender != owner()) {
            ERC20 tk = getToken();
            require(
                tk.balanceOf(msg.sender) >= VOTE_THRESHOLD * (10 ** tk.decimals()),
                "Need threshold tokens"
            );
            require(eligibleVoters[msg.sender], "Not registered");
        }
        _;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Зарегистрироваться в DAO (достаточно токенов на балансе)
    function registerVoter() external whenNotPaused {       
        ERC20 tk = getToken();
        require(
            tk.balanceOf(msg.sender) >= VOTE_THRESHOLD * (10 ** tk.decimals()),
            "Need threshold tokens"
        );
        require(!eligibleVoters[msg.sender], "Already registered");
        eligibleVoters[msg.sender] = true;
        totalRegisteredVoters++;
        emit VoterRegistered(msg.sender);
    }

    /// @notice Создать предложение с указанным периодом голосования
    function createProposal(string calldata description, uint256 votingPeriod)
        public onlyEligibleVoter whenNotPaused
    {
        require(
            votingPeriod >= minVotingPeriod && votingPeriod <= maxVotingPeriod,
            "Invalid voting period"
        );
        uint256 id = proposals.length;
        proposals.push(Proposal({
            proposer:      msg.sender,
            description:   description,
            executed:      false,
            yesVotes:      0,
            noVotes:       0,
            endTime:       block.timestamp + votingPeriod,
            rewardsIssued: false
        }));
        emit ProposalCreated(id, msg.sender, description, block.timestamp + votingPeriod);
    }

    /// @notice Упрощённый вариант — с минимальным периодом
    function createProposalSimple(string calldata description)
        external onlyEligibleVoter whenNotPaused
    {
        createProposal(description, minVotingPeriod);
    }

    /// @notice Подтвердить участие в конкретном голосовании (opt‑in)
    function optIn(uint256 proposalId)
        external onlyEligibleVoter whenNotPaused
    {
        require(proposalId < proposals.length, "Invalid proposalId");
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.endTime, "Voting ended");
        require(!hasOptedIn[proposalId][msg.sender], "Already opted in");
        require(optedInCount[proposalId] < MAX_VOTERS_PER_PROPOSAL, "Too many voters");

        hasOptedIn[proposalId][msg.sender] = true;
        optedInCount[proposalId]++;
        emit OptedIn(proposalId, msg.sender);
    }

    /// @notice Отдать голос — только после opt‑in
    function vote(uint256 proposalId, bool support)
        public onlyEligibleVoter whenNotPaused
    {
        require(proposalId < proposals.length, "Invalid proposalId");
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.endTime, "Voting ended");
        require(hasOptedIn[proposalId][msg.sender], "Must opt-in first");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        voteChoice[proposalId][msg.sender]  = support;
        proposalVoters[proposalId].push(msg.sender);

        if (support) p.yesVotes++;
        else         p.noVotes++;

        emit Voted(proposalId, msg.sender, support);
    }

    function voteProposal(uint256 proposalId, bool support)
        external onlyEligibleVoter whenNotPaused
    {
        vote(proposalId, support);
    }

    /// @notice Исполнить предложение и выдать NFT (при кворуме и истечении timelock)
    function executeProposal(uint256 proposalId)
        external
        whenNotPaused
        nonReentrant
    {
    require(proposalId < proposals.length, "Invalid proposalId");
    Proposal storage p = proposals[proposalId];
    require(block.timestamp >= p.endTime + votingTimelock, "Timelock not expired");
    require(!p.executed, "Already executed");

    uint256 totalVotes = p.yesVotes + p.noVotes;
    // Проверяем кворум для всех, кроме владельца
    if (msg.sender != owner()) {
        require(
            optedInCount[proposalId] > 0 &&
            totalVotes * 100 >= optedInCount[proposalId] * quorumPercent,
            "Quorum not met"
        );
    }

    p.executed = true;
    bool success = p.yesVotes > p.noVotes;

    // Авто-выдача наград — только для не-owner’а и не чаще чем раз в 30 дней
    if (msg.sender != owner() && !p.rewardsIssued && block.timestamp >= lastVotingRewardTime + 30 days) {
        // Собираем списки winners и losers

            // Собираем списки winners и losers
            address[] memory allVoters = proposalVoters[proposalId];
            uint256 winCount;
            uint256 loseCount;
            for (uint256 i = 0; i < allVoters.length; i++) {
                if (voteChoice[proposalId][allVoters[i]]) winCount++;
                else                                    loseCount++;
            }
            address[] memory winners = new address[](winCount);
            address[] memory losers  = new address[](loseCount);
            uint256 wi;
            uint256 li;
            for (uint256 i = 0; i < allVoters.length; i++) {
                if (voteChoice[proposalId][allVoters[i]]) winners[wi++] = allVoters[i];
                else                                      losers[li++]  = allVoters[i];
            }

            // Попытка выдать награды
        try getNFTDiscount().awardVotingRewards(winners, losers, votingRewardBaseURI) {
            p.rewardsIssued      = true;
            lastVotingRewardTime = block.timestamp;
            emit NFTRewardsIssued(proposalId, winners, losers);
        } catch {
            emit NFTRewardsFailed(proposalId);
            // p.rewardsIssued остаётся false, чтобы можно было повторить вручную
            }
        }
      
       emit ProposalExecuted(proposalId, success);
    }

    /// @notice Ручная выдача наград — один раз на предложение
    function awardNFTReward(
        uint256 proposalId,
        address recipient,
        uint256 discountPercent,
        string calldata tokenURI
    ) external onlyOwner whenNotPaused nonReentrant {
        require(proposalId < proposals.length, "Invalid proposalId");
        Proposal storage p = proposals[proposalId];
        require(!p.rewardsIssued, "Rewards already issued for this proposal");

        p.rewardsIssued = true;
        getNFTDiscount().mint(recipient, discountPercent, tokenURI);
        emit NFTRewardAwarded(recipient, discountPercent, tokenURI);
    }

    function getProposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function setVotingTimelock(uint256 newTimelock) external onlyOwner whenNotPaused {
        votingTimelock = newTimelock;
        emit VotingTimelockUpdated(newTimelock);
    }

    function setVotingRewardBaseURI(string calldata newBaseURI) external onlyOwner whenNotPaused {
        votingRewardBaseURI = newBaseURI;
        emit VotingRewardBaseURIUpdated(newBaseURI);
    }
}
