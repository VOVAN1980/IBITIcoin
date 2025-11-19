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
 * @notice On-chain DAO с opt-in голосованием и NFT-наградами.
 */
abstract contract DAOModule is Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant VOTE_THRESHOLD = 100;
    uint256 public constant MAX_VOTERS_PER_PROPOSAL = 500;

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

    // Голосование
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public voteChoice;
    mapping(uint256 => address[]) public proposalVoters;

    // Регистрация
    mapping(address => bool) public eligibleVoters;
    uint256 public totalRegisteredVoters;

    // Opt-in
    mapping(uint256 => mapping(address => bool)) public hasOptedIn;
    mapping(uint256 => uint256) public optedInCount;

    // Параметры голосования
    uint256 public minVotingPeriod = 1 days;
    uint256 public maxVotingPeriod = 7 days;
    uint256 public quorumPercent   = 51;
    uint256 public votingTimelock  = 1 days;

    // Награды NFT
    string public votingRewardBaseURI = "ipfs://votingRewardsMetadata";
    uint256 public lastVotingRewardTime;

    // Events
    event ProposalCreated(uint256 indexed id, address indexed proposer, string description, uint256 endTime);
    event VoterRegistered(address indexed user);
    event OptedIn(uint256 indexed proposalId, address indexed voter);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId, bool success);
    event NFTRewardsIssued(uint256 proposalId, address[] winners, address[] losers);
    event NFTRewardsFailed(uint256 proposalId);
    event NFTRewardAwarded(address indexed recipient, uint256 discountPercent, string tokenURI);
    event VotingTimelockUpdated(uint256 newTimelock);
    event VotingRewardBaseURIUpdated(string newBaseURI);

    /// @notice Токен для проверки порога — реализуется в наследнике
    function getToken() public view virtual returns (ERC20);

    /// @notice NFTDiscount для наград — реализуется в наследнике
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

    /// @notice Регистрация в DAO
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

    /// @notice Создать предложение с явным периодом
    function createProposal(string calldata description, uint256 votingPeriod)
        public
        onlyEligibleVoter
        whenNotPaused
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

    /// @notice Упрощённый вариант — минимальный период
    function createProposalSimple(string calldata description)
        external
        onlyEligibleVoter
        whenNotPaused
        returns (bool)
    {
        createProposal(description, minVotingPeriod);
        return true;
    }

    /// @notice Opt-in в конкретное голосование
    function optIn(uint256 proposalId)
        external
        onlyEligibleVoter
        whenNotPaused
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

    /// @notice Голос после opt-in
    function vote(uint256 proposalId, bool support)
        public
        onlyEligibleVoter
        whenNotPaused
    {
        require(proposalId < proposals.length, "Invalid proposalId");
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.endTime, "Voting ended");
        require(hasOptedIn[proposalId][msg.sender], "Must opt-in first");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        voteChoice[proposalId][msg.sender] = support;
        proposalVoters[proposalId].push(msg.sender);

        if (support) p.yesVotes++;
        else         p.noVotes++;

        emit Voted(proposalId, msg.sender, support);
    }

    function voteProposal(uint256 proposalId, bool support)
        external
        onlyEligibleVoter
        whenNotPaused
        returns (bool)
    {
        vote(proposalId, support);
        return true;
    }

    /// @notice Внутренняя логика исполнения
    function _executeProposalInternal(uint256 proposalId)
        internal
        returns (bool success)
    {
        require(proposalId < proposals.length, "Invalid proposalId");
        Proposal storage p = proposals[proposalId];
        require(block.timestamp >= p.endTime + votingTimelock, "Timelock not expired");
        require(!p.executed, "Already executed");

        uint256 totalVotes = p.yesVotes + p.noVotes;

        // Кворум обязателен для обычных (не owner)
        if (msg.sender != owner()) {
            require(
                optedInCount[proposalId] > 0 &&
                totalVotes * 100 >= optedInCount[proposalId] * quorumPercent,
                "Quorum not met"
            );
        }

        p.executed = true;
        success = (p.yesVotes > p.noVotes);

        // Авто-выдача наград — только если не делали и не чаще, чем раз в 30 дней
        if (
            success &&
            msg.sender != owner() &&
            !p.rewardsIssued &&
            block.timestamp >= lastVotingRewardTime + 30 days
        ) {
            address[] memory allVoters = proposalVoters[proposalId];
            uint256 winCount;
            uint256 loseCount;

            for (uint256 i; i < allVoters.length; i++) {
                if (voteChoice[proposalId][allVoters[i]]) winCount++;
                else                                      loseCount++;
            }

            address[] memory winners = new address[](winCount);
            address[] memory losers  = new address[](loseCount);
            uint256 wi;
            uint256 li;

            for (uint256 i; i < allVoters.length; i++) {
                if (voteChoice[proposalId][allVoters[i]]) winners[wi++] = allVoters[i];
                else                                      losers[li++]  = allVoters[i];
            }

            try getNFTDiscount().awardVotingRewards(winners, losers, votingRewardBaseURI) {
                p.rewardsIssued      = true;
                lastVotingRewardTime = block.timestamp;
                emit NFTRewardsIssued(proposalId, winners, losers);
            } catch {
                emit NFTRewardsFailed(proposalId);
            }
        }

        emit ProposalExecuted(proposalId, success);
    }

    /// @notice Публичный вызов исполнения (если кто-то дергает напрямую)
    function executeProposal(uint256 proposalId)
        external
        whenNotPaused
        nonReentrant
        returns (bool)
    {
        return _executeProposalInternal(proposalId);
    }

    /// @notice Обёртка под IDAOModuleSimple для IBITIcoin
    function executeProposalSimple(uint256 proposalId)
        external
        whenNotPaused
        nonReentrant
        returns (bool)
    {
        return _executeProposalInternal(proposalId);
    }

    /// @notice Ручная выдача NFT — fallback
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
