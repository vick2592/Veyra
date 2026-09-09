'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { type Chain } from 'viem';

const anvilChain: Chain = {
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545'] },
  },
};

const wagmiConfig = createConfig({
  chains: [anvilChain],
  transports: {
    [anvilChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545'),
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