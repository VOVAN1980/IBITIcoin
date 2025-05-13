// IBITI Blockchain - Полная интеграция с IBITI Token, Staking, DAO, AI и Multi-Chain
// Базовая структура на Substrate + Proof-of-Intelligence (PoI) + Token Burn System + Staking + DAO Governance + Voting Rewards + Anti-Abuse Measures + Transparency Audit

use sp_runtime::traits::{IdentifyAccount, Verify};
use frame_support::{decl_module, decl_storage, decl_event, decl_error, dispatch, codec::Encode};
use frame_system::ensure_signed;
use sp_std::collections::btree_map::BTreeMap;

#[cfg(test)]
mod tests;

pub type Signature = sp_runtime::MultiSignature;

pub trait Config: frame_system::Config {
    type Event: From<Event<Self>> + Into<<Self as frame_system::Config>::Event>;
}

decl_storage! {
    trait Store for Module<T: Config> as IBITIModule {
        /// Баланс токенов каждого аккаунта
        BalanceOf get(fn balance_of): map hasher(blake2_128_concat) T::AccountId => u128;
        /// Репутация узлов в сети
        NodeReputation get(fn node_reputation): map hasher(blake2_128_concat) T::AccountId => u32;
        /// Активность узлов
        NodeActivity get(fn node_activity): map hasher(blake2_128_concat) T::AccountId => u32;
        /// Награды за стейкинг
        StakingRewards get(fn staking_rewards): map hasher(blake2_128_concat) T::AccountId => u128;
        /// Голосование за предложения DAO
        Proposals get(fn proposals): map hasher(blake2_128_concat) u32 => (T::AccountId, u128, u128);
        ProposalCount get(fn proposal_count): u32;
        /// Лог подозрительной активности
        SuspiciousActivity get(fn suspicious_activity): Vec<(T::AccountId, u64, &'static str)>;
        /// Текущая комиссия за транзакции
        TransactionFees get(fn transaction_fees): u128;
    }
}

decl_event!(
    pub enum Event<T> where AccountId = <T as frame_system::Config>::AccountId {
        TokensTransferred(AccountId, AccountId, u128, u128);
        ReputationUpdated(AccountId, u32);
        AnomalousActivityDetected(AccountId);
        RewardGranted(AccountId, u128);
        TokensBurned(AccountId, u128);
        TokensStaked(AccountId, u128);
        TokensUnstaked(AccountId, u128);
        ProposalCreated(AccountId, u32, u128);
        Voted(AccountId, u32, bool, u128);
        ProposalFinalized(u32, bool);
        ProposalExecuted(u32);
        VotingRewardGranted(AccountId, u128);
        PenaltyApplied(AccountId, u128);
        SuspiciousActivityLogged(AccountId, &'static str);
        TransactionFeeUpdated(u128);
    }
);

decl_module! {
    pub struct Module<T: Config> for enum Call where origin: T::Origin {
        type Error = Error<T>;
        fn deposit_event() = default;

        #[weight = 10_000]
        fn set_transaction_fee(origin, fee: u128) -> dispatch::DispatchResult {
            let sender = ensure_signed(origin)?;
            ensure!(sender == T::AccountId::default(), Error::<T>::UnauthorizedNode);
            <TransactionFees>::put(fee);
            Self::deposit_event(RawEvent::TransactionFeeUpdated(fee));
            Ok(())
        }

        #[weight = 10_000]
        fn get_account_info(origin, account: T::AccountId) -> dispatch::DispatchResult {
            let _ = ensure_signed(origin)?;
            let balance = Self::balance_of(&account);
            let staked = Self::staking_rewards(&account);
            log::info!("Account Info: {:?}, Balance: {}, Staked: {}", account, balance, staked);
            Ok(())
        }
    }
}
