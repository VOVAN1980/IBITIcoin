// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Always reverts
contract MockDAORevert {
    function createProposalSimple(string calldata) external pure {
        revert("fail");
    }
    function voteProposal(uint256, bool) external pure {
        revert("fail");
    }
    function executeProposalSimple(uint256) external pure {
        revert("fail");
    }
}
