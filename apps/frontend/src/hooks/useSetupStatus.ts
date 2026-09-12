'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { registryAbi, registryAddress } from '@/lib/worldIdAuthorization';

/**
 * "Already set up" means registered on VeyraRegistry AND has at least one
 * secret stored — the same two steps Setup's own UI asks for. Checked
 * against real chain state, not local component state: Setup used to gate
 * its own "done" step on this-session's ephemeral secretState, so a
 * returning, already-set-up wallet landing on / or /setup saw an
 * incomplete-looking form and had to create a redundant secret (a real
 * wallet signature) just to unlock Continue. This is what Landing and
 * Setup poll to redirect straight to /agents instead.
 *
 * `isReady` stays false while wagmi's own reconnect-on-mount is still
 * resolving (status 'connecting'/'reconnecting') so callers don't render a
 * "not connected" flash for a wallet that's about to silently reconnect.
 */
export function useSetupStatus() {
  const { address, isConnected, status } = useAccount();
  const publicClient = usePublicClient();
  const [isReady, setIsReady] = useState(false);
  const [isSetUp, setIsSetUp] = useState(false);

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') {
      return;
    }

    let active = true;

    async function check() {
      if (!isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
        if (active) {
          setIsSetUp(false);
          setIsReady(true);
        }
        return;
      }
      try {
        const registered = await publicClient.readContract({
          address: registryAddress,
          abi: registryAbi,
          functionName: 'isRegistered',
          args: [address],
        });
        if (!registered) {
          if (active) {
            setIsSetUp(false);
            setIsReady(true);
          }
          return;
        }
        const secretIds = await publicClient.readContract({
          address: registryAddress,
          abi: registryAbi,
          functionName: 'secretIdsOf',
          args: [address],
        });
        if (active) {
          setIsSetUp(secretIds.length > 0);
          setIsReady(true);
        }
      } catch {
        if (active) {
          setIsSetUp(false);
          setIsReady(true);
        }
      }
    }

    void check();
    return () => {
      active = false;
    };
  }, [status, isConnected, address, publicClient]);

  return { isReady, isSetUp };
}
