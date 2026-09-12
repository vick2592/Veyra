'use client';

import { useChainId, useSwitchChain } from 'wagmi';
import { wagmiConfig } from '@/app/Web3Provider';

/**
 * On-chain writes (authorizeAgent, registerUser, storeSecret) go through
 * whatever chain the connected wallet is active on. If that's a chain we
 * never configured (e.g. still on Ethereum mainnet), wagmi throws a
 * ChainMismatchError only after the user already tried to sign — this lets
 * a caller check first and offer a switch instead of a failed signature.
 */
export function useRequiredChain() {
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const requiredChain = wagmiConfig.chains[0];
  const isSupportedChain = wagmiConfig.chains.some((chain) => chain.id === chainId);

  return {
    isWrongChain: !isSupportedChain,
    isSwitching,
    requiredChainName: requiredChain.name,
    switchToRequiredChain: () => switchChain({ chainId: requiredChain.id }),
  };
}
