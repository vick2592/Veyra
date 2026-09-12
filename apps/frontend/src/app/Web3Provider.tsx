'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { type Chain } from 'viem';
import { baseSepolia } from 'viem/chains';

const baseSepoliaRpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
const anvilRpcUrl = process.env.NEXT_PUBLIC_ANVIL_RPC_URL ?? 'http://127.0.0.1:8545';

const anvilChain: Chain = {
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [anvilRpcUrl] },
  },
};

export const wagmiConfig = createConfig({
  chains: [baseSepolia, anvilChain],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(baseSepoliaRpcUrl),
    [anvilChain.id]: http(anvilRpcUrl),
  },
});

const queryClient = new QueryClient();

export default function Web3Provider({children}: {children: React.ReactNode}) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}