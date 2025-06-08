// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Always returns false
contract MockDAOFalse {
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
