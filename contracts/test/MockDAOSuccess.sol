// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockDAOSuccess {
    event Created(string desc);
    event Voted(uint256 id, bool support);
    event Executed(uint256 id);

    function createProposalSimple(string calldata d) external returns (bool) {
        emit Created(d);
        return true;
    }
    function voteProposal(uint256 id, bool support) external returns (bool) {
        emit Voted(id, support);
        return true;
    }
    function executeProposalSimple(uint256 id) external returns (bool) {
        emit Executed(id);
        return true;
    }
}

contract MockDAOFail {
    function createProposalSimple(string calldata) external pure returns (bool) {
        return false;
    }
    function voteProposal(uint256, bool) external pure returns (bool) {
        return false;
    }
    function executeProposalSimple(uint256) external pure returns (bool) {
        return false;
    }
}
