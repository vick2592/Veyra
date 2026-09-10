'use client';

import { useEffect, useRef, useState } from 'react';
import { keccak256, encodePacked, toBytes } from 'viem';
import { useAccount, useConnect, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import {
  IDKitRequestWidget,
  selfieCheckLegacy,
  type IDKitResult,
  type RpContext,
} from '@worldcoin/idkit';

type SimulatorState = 'idle' | 'submitting' | 'accepted' | 'error';
type AuthorizationState = 'idle' | 'preparing_rp' | 'idkit_open' | 'proof_ready' | 'submitting_tx' | 'waiting_for_tx' | 'polling_execution' | 'success' | 'error';

type PendingRequest = {
  requestId: string;
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
  agentAddress: string;
  secretIdentifier: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  result?: unknown;
  error?: {code: string; message: string};
};

type OnChainProof = {
  root: string;
  nullifierHash: string;
  proof: string[];
};

const backendUrl = 'http://localhost:3001';
const worldAppId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? '';
const worldRpId = process.env.NEXT_PUBLIC_WORLD_ID_RP_ID ?? '';
const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}` | undefined;
const dummyAgentAddress = '0x0000000000000000000000000000000000000001';

const registryAbi = [{
  type: 'function',
  name: 'authorizeAgent',
  stateMutability: 'nonpayable',
  inputs: [
    {name: 'agentAddress', type: 'address'},
    {name: 'secretId', type: 'bytes32'},
    {name: 'root', type: 'uint256'},
    {name: 'nullifierHash', type: 'uint256'},
    {name: 'proof', type: 'uint256[8]'},
    {name: 'requestId', type: 'bytes32'},
  ],
  outputs: [],
}] as const;

async function fetchPendingRequests(signal?: AbortSignal): Promise<PendingRequest[]> {
  const response = await fetch(`${backendUrl}/api/bazantic/pending`, {signal});
  if (!response.ok) {
    throw new Error(`Pending requests failed with HTTP ${response.status}.`);
  }
  const body = await response.json() as {requests?: PendingRequest[]};
  return body.requests ?? [];
}

function getOnChainProof(result: IDKitResult): OnChainProof {
  const legacyResult = result as IDKitResult & {
    root?: string;
    nullifier_hash?: string;
    proof?: string[];
  };
  if (
    legacyResult.root !== undefined &&
    legacyResult.nullifier_hash !== undefined &&
    legacyResult.proof !== undefined &&
    legacyResult.proof.length === 8
  ) {
    return {
      root: legacyResult.root,
      nullifierHash: legacyResult.nullifier_hash,
      proof: legacyResult.proof,
    };
  }

  const response = result.responses[0] as {
    merkle_root?: string;
    nullifier?: string;
    proof?: string[];
    session_nullifier?: string[];
  } | undefined;
  const proof = response?.proof;
  const root = response?.merkle_root ?? proof?.[4];
  const nullifierHash = response?.nullifier ?? response?.session_nullifier?.[0];
  if (root === undefined || nullifierHash === undefined || proof === undefined || proof.length !== 8) {
    throw new Error('World ID returned an incomplete on-chain proof.');
  }

  return {root, nullifierHash, proof};
}

function getSecretId(secretIdentifier: string): `0x${string}` {
  return keccak256(toBytes(secretIdentifier));
}

function getWorldIdSignal(
  userAddress: `0x${string}`,
  agentAddress: `0x${string}`,
  secretId: `0x${string}`,
): string {
  const digest = keccak256(encodePacked(
    ['address', 'address', 'bytes32'],
    [userAddress, agentAddress, secretId],
  ));
  return (BigInt(digest) >> BigInt(8)).toString();
}

export default function SandboxPage() {
  const [simulatorState, setSimulatorState] = useState<SimulatorState>('idle');
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedSecretIdentifier, setSelectedSecretIdentifier] = useState<string | null>(null);
  const [authorizationState, setAuthorizationState] = useState<AuthorizationState>('idle');
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [worldIdProof, setWorldIdProof] = useState<OnChainProof | null>(null);
  const [authorizationTxHash, setAuthorizationTxHash] = useState<`0x${string}` | null>(null);
  const [executionStatus, setExecutionStatus] = useState<PendingRequest['status'] | null>(null);
  const [executionResult, setExecutionResult] = useState<unknown>(null);
  const [executionError, setExecutionError] = useState<{code?: string; message: string} | null>(null);
  const proofCandidate = useRef<OnChainProof | null>(null);
  const {address, isConnected} = useAccount();
  const {connect, connectors} = useConnect();
  const {writeContractAsync} = useWriteContract();
  const {
    isLoading: isTransactionPending,
    isSuccess: isTransactionConfirmed,
    isError: isTransactionError,
    error: transactionError,
  } = useWaitForTransactionReceipt({
    hash: authorizationTxHash ?? undefined,
    confirmations: 1,
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function refreshPendingRequests() {
      try {
        const requests = await fetchPendingRequests(controller.signal);
        setPendingRequests(requests);
        setSelectedRequestId((currentId) => {
          if (currentId !== null && requests.some((request) => request.requestId === currentId)) {
            return currentId;
          }
          return null;
        });
        setSelectedSecretIdentifier((currentIdentifier) => {
          if (currentIdentifier !== null && requests.some((request) => request.secretIdentifier === currentIdentifier)) {
            return currentIdentifier;
          }
          return null;
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setMessage(error instanceof Error ? error.message : 'Pending requests could not be loaded.');
        }
      }
    }

    void refreshPendingRequests();
    const interval = window.setInterval(() => {
      void refreshPendingRequests();
    }, 3_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (authorizationTxHash === null || !isTransactionConfirmed || selectedRequestId === null) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    setAuthorizationState('polling_execution');
    setExecutionStatus('executing');
    setMessage('Authorization confirmed. Waiting for the chain listener to execute the capability...');

    async function pollExecutionStatus() {
      try {
        const response = await fetch(`${backendUrl}/api/bazantic/requests/${selectedRequestId}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('The request was not found. It may have expired.');
          }
          throw new Error(`Execution status failed with HTTP ${response.status}.`);
        }
        const request = await response.json() as PendingRequest;
        if (!active) {
          return;
        }
        setExecutionStatus(request.status);
        setPendingRequests((current) => {
          const withoutRequest = current.filter((item) => item.requestId !== request.requestId);
          return request.status === 'pending_human_auth' ? [...withoutRequest, request] : withoutRequest;
        });
        if (request.status === 'completed') {
          setExecutionResult(request.result);
          setExecutionError(null);
          setAuthorizationState('success');
          setMessage('Capability completed. The final provider result is ready.');
        } else if (request.status === 'failed') {
          setExecutionResult(null);
          setExecutionError(request.error ?? {message: 'The capability execution failed.'});
          setAuthorizationState('error');
          setMessage(request.error?.message ?? 'The capability execution failed.');
        } else {
          setMessage('Authorization confirmed. The chain listener is executing the capability...');
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError') && active) {
          setExecutionError({message: error instanceof Error ? error.message : 'Execution status could not be loaded.'});
          setAuthorizationState('error');
          setMessage(error instanceof Error ? error.message : 'Execution status could not be loaded.');
        }
      }
    }

    void pollExecutionStatus();
    const interval = window.setInterval(() => {
      void pollExecutionStatus();
    }, 3_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [authorizationTxHash, isTransactionConfirmed, selectedRequestId]);

  useEffect(() => {
    if (!isTransactionError || transactionError === null) {
      return;
    }
    setAuthorizationState('error');
    setExecutionError({message: transactionError.message});
    setMessage(`Authorization transaction failed: ${transactionError.message}`);
  }, [isTransactionError, transactionError]);

  async function handleSimulateAgentRequest() {
    setSimulatorState('submitting');
    setMessage('Sending a mock paid agent request...');

    try {
      const idempotencyKey = `sandbox-${crypto.randomUUID()}`;
      const paymentReference = `sandbox-payment-${Date.now()}`;
      const response = await fetch(`${backendUrl}/api/bazantic/requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Payment-Signature': paymentReference,
          'X-PAYMENT': paymentReference,
          'x-payment-reference': paymentReference,
        },
        body: JSON.stringify({
          secretIdentifier: 'openai-key',
          agentAddress: dummyAgentAddress,
          idempotencyKey,
        }),
      });
      const body = await response.json().catch(() => null) as {
        requestId?: string;
        status?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? `Agent request failed with HTTP ${response.status}.`);
      }

      setSimulatorState('accepted');
      setMessage(`Request ${body?.requestId ?? 'accepted'} is ${body?.status ?? 'pending_human_auth'}.`);
      setPendingRequests(await fetchPendingRequests());
    } catch (error) {
      setSimulatorState('error');
      setMessage(error instanceof Error ? error.message : 'The simulated request could not be sent.');
    }
  }

  async function handleAuthorizeOnChain() {
    if (
      selectedRequest === undefined ||
      selectedRequestId === null ||
      selectedSecretIdentifier === null ||
      worldIdProof === null ||
      address === undefined ||
      registryAddress === undefined
    ) {
      setAuthorizationState('error');
      setMessage('Select a request, complete Face Auth, connect a wallet, and configure the registry first.');
      return;
    }

    setAuthorizationState('submitting_tx');
    setExecutionStatus(null);
    setExecutionResult(null);
    setExecutionError(null);
    setMessage('Submitting on-chain authorization...');
    try {
      const transactionHash = await writeContractAsync({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'authorizeAgent',
        args: [
          selectedRequest.agentAddress as `0x${string}`,
          getSecretId(selectedSecretIdentifier),
          BigInt(worldIdProof.root),
          BigInt(worldIdProof.nullifierHash),
          worldIdProof.proof.map((value) => BigInt(value)) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          selectedRequestId as `0x${string}`,
        ],
      });
      setAuthorizationTxHash(transactionHash);
      setAuthorizationState('waiting_for_tx');
      setMessage(`Authorization submitted: ${transactionHash.slice(0, 14)}... Waiting for confirmation.`);
    } catch (error) {
      setAuthorizationState('error');
      setExecutionError({message: error instanceof Error ? error.message : 'Authorization transaction failed.'});
      setMessage(error instanceof Error ? error.message : 'Authorization transaction failed.');
    }
  }

  const isSubmitting = simulatorState === 'submitting';
  const selectedRequest = pendingRequests.find((request) => request.requestId === selectedRequestId);
  const selectedSecretId = selectedSecretIdentifier === null ? null : getSecretId(selectedSecretIdentifier);
  const canAuthorize = isMounted && selectedRequest !== undefined &&
    selectedRequestId !== null &&
    selectedSecretIdentifier !== null &&
    selectedSecretId !== null &&
    worldIdProof !== null &&
    isConnected &&
    address !== undefined &&
    registryAddress !== undefined &&
    authorizationState === 'proof_ready';

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto min-h-[calc(100vh-3rem)] max-w-6xl rounded-4xl border border-(--line) bg-[rgba(255,253,246,0.66)] p-6 shadow-[0_24px_80px_rgba(23,33,27,0.12)] backdrop-blur sm:min-h-[calc(100vh-5rem)] sm:p-10">
        <header className="flex items-center justify-between border-b border-(--line) pb-5">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em]">
            <span className="h-3 w-3 rounded-full bg-(--lime) ring-4 ring-[rgba(217,242,106,0.28)]" />
            Veyra Sandbox
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-(--muted)">Developer surface / 01</span>
        </header>

        <section className="grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-(--muted)">Agent request simulator</p>
            <h1 className="max-w-3xl text-5xl leading-[0.96] tracking-[-0.03em] sm:text-7xl">
              Put a request in the gate.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-(--muted) sm:text-xl">
              Create a local paid request for the human authorization flow. Queue selection and World ID authorization will appear here next.
            </p>
          </div>

          <div className="border-l border-(--line) pl-6 lg:mb-1">
            <p className="text-sm leading-6 text-(--muted)">
              This sandbox targets the allowlisted <strong className="font-semibold text-(--ink)">openai-key</strong> identifier and uses a local mock payment reference.
            </p>
          </div>
        </section>

        <section className="border-t border-(--line) pt-6" aria-live="polite">
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Incoming agent request</p>
              <p className="mt-2 text-2xl">Execute capability with openai-key</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-(--muted)">
                The simulator sends the request to the local Bazantic endpoint with a fresh idempotency key.
              </p>
              {message && (
                <p className={`mt-4 max-w-xl text-sm ${simulatorState === 'error' ? 'text-[#a83f31]' : simulatorState === 'accepted' ? 'text-[#28734a]' : 'text-(--muted)'}`}>
                  {message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSimulateAgentRequest}
              disabled={isSubmitting}
              className="min-w-60 rounded-full bg-(--ink) px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2a3a2f] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting ? 'Sending request...' : 'Simulate Agent Request'}
            </button>
          </div>
        </section>

        <section className="mt-6 border-t border-(--line) pt-6" aria-live="polite">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Pending queue</p>
              <p className="mt-2 text-sm leading-6 text-(--muted)">
                Select an active request to prepare it for human authorization.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.14em] text-(--muted)">
              {pendingRequests.length} active
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {pendingRequests.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-(--line) px-4 py-5 text-sm text-(--muted)">
                No active requests. Simulate an agent request to populate the queue.
              </p>
            ) : pendingRequests.map((request) => {
              const isSelected = request.requestId === selectedRequestId;
              return (
                <button
                  key={request.requestId}
                  type="button"
                  onClick={() => {
                    setSelectedRequestId(request.requestId);
                    setSelectedSecretIdentifier(request.secretIdentifier);
                    setAuthorizationState('idle');
                    setRpContext(null);
                    setWidgetOpen(false);
                    setWorldIdProof(null);
                    setAuthorizationTxHash(null);
                    setExecutionStatus(null);
                    setExecutionResult(null);
                    setExecutionError(null);
                    proofCandidate.current = null;
                    setMessage(`Selected ${request.secretIdentifier} for authorization.`);
                  }}
                  className={`grid gap-3 rounded-2xl border px-4 py-4 text-left transition sm:grid-cols-[1fr_auto] sm:items-center ${isSelected ? 'border-(--ink) bg-white' : 'border-(--line) bg-white/45 hover:bg-white'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{request.secretIdentifier}</span>
                    <span className="mt-1 block text-xs text-(--muted)">
                      {request.requestId.slice(0, 14)}... · {request.agentAddress.slice(0, 8)}...{request.agentAddress.slice(-6)}
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-[0.14em] text-(--muted)">
                    {request.status.replaceAll('_', ' ')} · {isMounted ? `expires ${new Date(request.expiresAt).toLocaleTimeString()}` : 'checking expiry'}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedRequest !== undefined && selectedSecretIdentifier !== null && (
            <p className="mt-4 text-sm text-(--muted)">
              Selected target: <strong className="font-semibold text-(--ink)">{selectedSecretIdentifier}</strong>
            </p>
          )}
        </section>

        <section className="mt-6 border-t border-(--line) pt-6" aria-live="polite">
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">World ID Face Auth</p>
              <p className="mt-2 text-2xl">
                {selectedRequest === undefined ? 'Select a request to begin.' : selectedSecretIdentifier}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-(--muted)">
                {worldIdProof !== null
                  ? 'Proof captured. Submit the selected request for on-chain authorization.'
                  : 'The selected request determines the signed World ID action.'}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              {!isMounted ? (
                <div className="h-13 min-w-56 animate-pulse rounded-full border border-(--line) bg-white/55" aria-label="Loading wallet controls" />
              ) : !isConnected ? (
                <button
                  type="button"
                  onClick={() => connectors[0] !== undefined && connect({connector: connectors[0]})}
                  disabled={connectors[0] === undefined}
                  className="min-w-56 rounded-full border border-(--ink) px-6 py-4 text-sm font-semibold text-(--ink) transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Connect wallet for Face Auth
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedRequest === undefined || address === undefined) {
                      setAuthorizationState('error');
                      setMessage('Select a request and connect a wallet before starting Face Auth.');
                      return;
                    }

                    setAuthorizationState('preparing_rp');
                    setWorldIdProof(null);
                    proofCandidate.current = null;
                    setMessage('Preparing a signed World ID request...');
                    try {
                      const response = await fetch(`${backendUrl}/api/world-id/sign`, {
                        method: 'POST',
                        headers: {'content-type': 'application/json'},
                        body: JSON.stringify({action: selectedRequest.secretIdentifier}),
                      });
                      const body = await response.json().catch(() => null) as {
                        error?: string;
                        rp_id?: string;
                        nonce?: string;
                        created_at?: number;
                        expires_at?: number;
                        signature?: string;
                      } | null;
                      if (!response.ok) {
                        throw new Error(body?.error ?? 'The broker could not prepare World ID authorization.');
                      }
                      if (
                        body?.rp_id === undefined ||
                        body.nonce === undefined ||
                        body.created_at === undefined ||
                        body.expires_at === undefined ||
                        body.signature === undefined
                      ) {
                        throw new Error('The broker returned an incomplete RP context.');
                      }

                      setRpContext({
                        rp_id: body.rp_id,
                        nonce: body.nonce,
                        created_at: body.created_at,
                        expires_at: body.expires_at,
                        signature: body.signature,
                      });
                      setWidgetOpen(true);
                      setAuthorizationState('idkit_open');
                      setMessage('Complete the World ID Selfie Check to continue.');
                    } catch (error) {
                      setAuthorizationState('error');
                      setMessage(error instanceof Error ? error.message : 'World ID authorization could not start.');
                    }
                  }}
                  disabled={selectedRequest === undefined || authorizationState === 'preparing_rp' || worldAppId.length === 0 || worldRpId.length === 0}
                  className="min-w-56 rounded-full bg-(--ink) px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2a3a2f] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {authorizationState === 'preparing_rp' ? 'Preparing Face Auth...' : 'Start Face Auth'}
                </button>
              )}
              {isMounted && isConnected && address !== undefined && (
                <span className="text-xs text-(--muted)">{address.slice(0, 6)}...{address.slice(-4)}</span>
              )}
              {isMounted && (
                <button
                  type="button"
                  onClick={() => void handleAuthorizeOnChain()}
                  disabled={!canAuthorize || isTransactionPending}
                  className="min-w-56 rounded-full border border-(--ink) px-6 py-4 text-sm font-semibold text-(--ink) transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {authorizationState === 'submitting_tx' ? 'Submitting...' : authorizationState === 'waiting_for_tx' ? 'Confirming...' : 'Authorize Agent'}
                </button>
              )}
            </div>
          </div>

          {rpContext !== null && selectedRequest !== undefined && address !== undefined && (
            <IDKitRequestWidget
              open={widgetOpen}
              onOpenChange={setWidgetOpen}
              app_id={worldAppId as `app_${string}`}
              action={selectedRequest.secretIdentifier}
              rp_context={rpContext}
              environment="staging"
              allow_legacy_proofs={true}
              preset={selfieCheckLegacy({
                signal: getWorldIdSignal(
                  address,
                  selectedRequest.agentAddress as `0x${string}`,
                  getSecretId(selectedRequest.secretIdentifier),
                ),
              })}
              handleVerify={async (result: IDKitResult) => {
                proofCandidate.current = getOnChainProof(result);
                setMessage('Proof received. Completing World ID verification...');
              }}
              onSuccess={() => {
                const proof = proofCandidate.current;
                if (proof === null) {
                  setAuthorizationState('error');
                  setMessage('World ID completed without an on-chain proof.');
                  return;
                }
                console.log("Captured World ID Proof:", proof);
                setWorldIdProof({
                  root: proof.root,
                  nullifierHash: proof.nullifierHash,
                  proof: proof.proof,
                });
                setAuthorizationState('proof_ready');
                setRpContext(null);
                setWidgetOpen(false);
                setMessage('World ID proof captured and ready for authorization.');
              }}
              onError={(errorCode: string) => {
                proofCandidate.current = null;
                setWorldIdProof(null);
                setAuthorizationState('error');
                setRpContext(null);
                setWidgetOpen(false);
                setMessage(`World ID verification failed: ${errorCode}.`);
              }}
              autoClose
            />
          )}
        </section>

        <section className="mt-6 border-t border-(--line) pt-6" aria-live="polite">
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Execution feedback</p>
              <p className="mt-2 text-2xl">
                {authorizationState === 'success' ? 'Capability complete.' : executionStatus === 'executing' ? 'Listener is executing.' : 'Awaiting authorization.'}
              </p>
              {authorizationTxHash !== null && (
                <p className="mt-3 break-all text-xs leading-5 text-(--muted)">
                  Transaction: {authorizationTxHash}
                </p>
              )}
              {executionError !== null && (
                <p className="mt-3 text-sm text-[#a83f31]">
                  {executionError.code !== undefined ? `${executionError.code}: ` : ''}{executionError.message}
                </p>
              )}
            </div>

            <div className="min-h-32 rounded-2xl border border-(--line) bg-white/55 p-4">
              {executionResult !== null ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap wrap-break-word text-sm leading-6 text-(--ink)">
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              ) : (
                <p className="text-sm leading-6 text-(--muted)">
                  The backend result will appear here after the confirmed authorization event reaches the chain listener.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
