'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { decodeAbiParameters, keccak256, encodePacked, toBytes } from 'viem';
import { useAccount, useConnect, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import {
  selfieCheckLegacy,
  orbLegacy,
  useIDKitRequest,
  type IDKitResult,
  type RpContext,
} from '@worldcoin/idkit';

type SimulatorState = 'idle' | 'submitting' | 'accepted' | 'error';
type AuthorizationState = 'idle' | 'preparing_rp' | 'idkit_open' | 'proof_ready' | 'submitting_tx' | 'waiting_for_tx' | 'polling_execution' | 'success' | 'error';
type VerificationMode = 'selfie' | 'orb';

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

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const worldAppId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? '';
const worldRpId = process.env.NEXT_PUBLIC_WORLD_ID_RP_ID ?? '';
const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}` | undefined;
const dummyAgentAddress = '0x0000000000000000000000000000000000000001';
const dummyUserAddress = '0x0000000000000000000000000000000000000002';

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
  try {
    const payload = result as IDKitResult & {
      root?: string;
      nullifier_hash?: string;
      proof?: string[] | string;
    };
    const response = result.responses[0] as {
      root?: string;
      merkle_root?: string;
      nullifier_hash?: string;
      nullifier?: string;
      proof?: string[] | string;
      session_nullifier?: string[];
    } | undefined;
    const candidate = payload.root !== undefined || payload.nullifier_hash !== undefined || payload.proof !== undefined
      ? payload
      : response;
    const rawProof = candidate?.proof;
    const proof = Array.isArray(rawProof)
      ? rawProof
      : typeof rawProof === 'string' && rawProof.trim().startsWith('[')
        ? JSON.parse(rawProof) as unknown
        : typeof rawProof === 'string'
          ? decodeAbiParameters([{type: 'uint256[8]'}], rawProof as `0x${string}`)[0]
          : undefined;
    if (!Array.isArray(proof) || proof.length !== 8 || proof.some((value) => typeof value !== 'string' && typeof value !== 'bigint')) {
      throw new Error(`World ID proof must contain exactly 8 values; received ${Array.isArray(proof) ? proof.length : typeof proof}.`);
    }

    const root = candidate?.root ?? (candidate === response ? response?.merkle_root : undefined) ?? (proof[4] as string | bigint);
    const nullifierHash = candidate?.nullifier_hash ?? (candidate === response ? response?.nullifier : undefined) ?? (candidate === response ? response?.session_nullifier?.[0] : undefined);
    if (root === undefined || nullifierHash === undefined) {
      throw new Error('World ID returned an incomplete on-chain proof.');
    }

    return {
      root: String(root),
      nullifierHash: String(nullifierHash),
      proof: proof.map((value) => String(value)),
    };
  } catch (error) {
    console.error('[World ID] proof normalization failed', {
      error,
      result,
      response: result.responses?.[0],
    });
    throw error instanceof Error ? error : new Error('World ID proof normalization failed.');
  }
}

function getSecretId(secretIdentifier: string): `0x${string}` {
  return keccak256(toBytes(secretIdentifier));
}

function getWorldIdSignal(
  userAddress: `0x${string}`,
  agentAddress: `0x${string}`,
  secretId: `0x${string}`,
): string {
  const rawPackedHex = encodePacked(
    ['address', 'address', 'bytes32'],
    [userAddress, agentAddress, secretId]
  );
  return rawPackedHex;
}

function getSimulatorUrl(connectorURI: string): string {
  return `https://simulator.worldcoin.org?connect_url=${encodeURIComponent(connectorURI)}`;
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export default function SandboxPage() {
  const [simulatorState, setSimulatorState] = useState<SimulatorState>('idle');
  const [isMounted, setIsMounted] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedSecretIdentifier, setSelectedSecretIdentifier] = useState<string | null>(null);
  const [verificationMode, setVerificationMode] = useState<VerificationMode>('selfie');
  const [authorizationState, setAuthorizationState] = useState<AuthorizationState>('idle');
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [simulatorCopyState, setSimulatorCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [worldIdProof, setWorldIdProof] = useState<OnChainProof | null>(null);
  const [authorizationTxHash, setAuthorizationTxHash] = useState<`0x${string}` | null>(null);
  const [executionStatus, setExecutionStatus] = useState<PendingRequest['status'] | null>(null);
  const [executionResult, setExecutionResult] = useState<unknown>(null);
  const [executionError, setExecutionError] = useState<{code?: string; message: string} | null>(null);
  const [activeExecutionRequestId, setActiveExecutionRequestId] = useState<string | null>(null);
  const activeExecutionRequestIdRef = useRef<string | null>(null);
  activeExecutionRequestIdRef.current = activeExecutionRequestId;
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
          // If an execution is actively being polled, preserve the selection
          // so the UI keeps showing the request context even after the backend
          // claims it and removes it from the pending queue.
          if (currentId !== null && activeExecutionRequestIdRef.current !== null && currentId === activeExecutionRequestIdRef.current) {
            return currentId;
          }
          if (currentId !== null && requests.some((request) => request.requestId === currentId)) {
            return currentId;
          }
          return null;
        });
        setSelectedSecretIdentifier((currentIdentifier) => {
          if (currentIdentifier !== null && activeExecutionRequestIdRef.current !== null) {
            return currentIdentifier;
          }
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
    setActiveExecutionRequestId(selectedRequestId);
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
          setActiveExecutionRequestId(null);
          setMessage('Capability completed. The final provider result is ready.');
        } else if (request.status === 'failed') {
          setExecutionResult(null);
          setExecutionError(request.error ?? {message: 'The capability execution failed.'});
          setAuthorizationState('error');
          setActiveExecutionRequestId(null);
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
  const verificationLabel = verificationMode === 'selfie' ? 'Selfie Check' : 'Orb';
  const hasSelectedRequest = selectedRequest !== undefined;
  const hasSelectedRequestId = selectedRequestId !== null;
  const hasSelectedSecretIdentifier = selectedSecretIdentifier !== null;
  const hasWorldIdProof = worldIdProof !== null;
  const hasWalletConnection = isConnected;
  const hasWalletAddress = address !== undefined;
  const hasRegistryAddress = registryAddress !== undefined;
  const hasProofReadyState = authorizationState === 'proof_ready';
  const canAuthorize = hasSelectedRequest &&
    hasSelectedRequestId &&
    hasSelectedSecretIdentifier &&
    hasWorldIdProof &&
    hasWalletConnection &&
    hasWalletAddress &&
    hasRegistryAddress;

  const {
    open: openIdKit,
    reset: resetIdKit,
    connectorURI,
    result: idKitResult,
    isSuccess: isIdKitSuccess,
    isError: isIdKitError,
    errorCode: idKitErrorCode,
    isOpen: isIdKitOpen,
  } = useIDKitRequest({
    app_id: worldAppId as `app_${string}`,
    action: 'execute-agent',
    rp_context: rpContext ?? {
      rp_id: worldRpId,
      nonce: '',
      created_at: 0,
      expires_at: 0,
      signature: '',
    },
    environment: 'staging',
    allow_legacy_proofs: true,
    preset: verificationMode === 'selfie'
      ? selfieCheckLegacy({
          signal: getWorldIdSignal(
            address ?? dummyUserAddress,
            (selectedRequest?.agentAddress ?? dummyAgentAddress) as `0x${string}`,
            getSecretId(selectedRequest?.secretIdentifier ?? 'sandbox'),
          ),
        })
      : orbLegacy({
          signal: getWorldIdSignal(
            address ?? dummyUserAddress,
            (selectedRequest?.agentAddress ?? dummyAgentAddress) as `0x${string}`,
            getSecretId(selectedRequest?.secretIdentifier ?? 'sandbox'),
          ),
        }),
  });
  const simulatorUrl = connectorURI === null ? null : getSimulatorUrl(connectorURI);

  useEffect(() => {
    if (connectorURI === null) {
      setQrDataUrl(null);
      return;
    }

    let active = true;
    void QRCode.toDataURL(connectorURI, {margin: 2, width: 280})
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setQrDataUrl(null);
        }
      });

    return () => {
      active = false;
    };
  }, [connectorURI]);

  useEffect(() => {
    if (connectorURI === null) {
      setSimulatorCopyState('idle');
    }
  }, [connectorURI]);

  async function handleCopySimulatorLink() {
    if (simulatorUrl === null) {
      return;
    }
    try {
      await copyText(simulatorUrl);
      setSimulatorCopyState('copied');
    } catch {
      setSimulatorCopyState('error');
    }
  }

  useEffect(() => {
    if (rpContext === null || selectedRequest === undefined || address === undefined || isIdKitOpen) {
      return;
    }
    openIdKit();
    setAuthorizationState('idkit_open');
  }, [address, isIdKitOpen, openIdKit, rpContext, selectedRequestId]);

  useEffect(() => {
    if (!isIdKitSuccess || idKitResult === null) {
      return;
    }
    console.log('[World ID] headless request completed', {
      result: idKitResult,
      protocolVersion: idKitResult.protocol_version,
      responseCount: idKitResult.responses?.length ?? 0,
    });
    try {
      const proof = getOnChainProof(idKitResult);
      proofCandidate.current = proof;
      setWorldIdProof(proof);
      setAuthorizationState('proof_ready');
      setRpContext(null);
      resetIdKit();
      setMessage('World ID proof captured and ready for authorization.');
    } catch (error) {
      proofCandidate.current = null;
      setWorldIdProof(null);
      setAuthorizationState('error');
      setRpContext(null);
      resetIdKit();
      setMessage(error instanceof Error ? error.message : 'World ID proof could not be normalized.');
    }
  }, [idKitResult, isIdKitSuccess, resetIdKit]);

  useEffect(() => {
    if (!isIdKitError || idKitErrorCode === null) {
      return;
    }
    console.error('[World ID] headless request failed', {errorCode: idKitErrorCode});
    proofCandidate.current = null;
    setWorldIdProof(null);
    setAuthorizationState('error');
    setRpContext(null);
    resetIdKit();
    setMessage(`World ID verification failed: ${idKitErrorCode}.`);
  }, [idKitErrorCode, isIdKitError, resetIdKit]);

  return (
    <main
      className="min-h-screen px-5 py-6 sm:px-10 sm:py-10"
      style={{
        background:
          'radial-gradient(circle at 12% 12%, rgba(183, 228, 199, 0.72), transparent 28rem), linear-gradient(135deg, #f7f3e9 0%, #f4f1e8 52%, #dcebdc 100%)',
        color: '#17211b',
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
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
              Put an agent request through the human gate.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-(--muted) sm:text-xl">
              An AI agent can request a capability, but it cannot authorize access to a sensitive key by itself. Selfie Check provides the anti-bot liveness and abuse-prevention gate before a human can authorize that request.
            </p>
          </div>

          <div className="border-l border-(--line) pl-6 lg:mb-1">
            <p className="text-sm leading-6 text-(--muted)">
              This sandbox targets the allowlisted <strong className="font-semibold text-(--ink)">openai-key</strong> identifier. Its payment reference is local mock data, not production Bazantic settlement.
            </p>
          </div>
        </section>

        <section className="border-t border-(--line) pt-6" aria-live="polite">
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Incoming agent request</p>
              <p className="mt-2 text-2xl">Execute capability with openai-key</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-(--muted)">
                The simulator sends a local mock-paid request to the broker with a fresh idempotency key. The request waits for human authorization before execution.
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
                Select an active agent request to bind it to a human authorization attempt before it expires.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.14em] text-(--muted)">
              {pendingRequests.length} active
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {pendingRequests.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-(--line) px-4 py-5 text-sm text-(--muted)">
                No active requests. Simulate an agent request to place one in the human authorization queue.
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
                    resetIdKit();
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
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">{verificationLabel} verification gate</p>
              <p className="mt-2 text-2xl">
                {selectedRequest === undefined ? 'Select an agent request to begin.' : selectedSecretIdentifier}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-(--muted)">
                {worldIdProof !== null
                  ? 'Liveness proof captured. The registry can now bind this human, agent, key identifier, and request before execution.'
                  : verificationMode === 'selfie'
                    ? 'Selfie Check confirms a live human is present. The selected request determines the signed World ID action and the key authorization scope.'
                    : 'Orb verification confirms a World ID proof. The selected request determines the signed World ID action and the key authorization scope.'}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <fieldset className="flex rounded-full border border-(--line) bg-white/55 p-1 text-sm" aria-label="Verification mode">
                <legend className="sr-only">Verification mode</legend>
                {(['selfie', 'orb'] as const).map((mode) => {
                  const isSelected = verificationMode === mode;
                  const label = mode === 'selfie' ? 'Selfie Check' : 'Orb';
                  return (
                    <label key={mode} className={`cursor-pointer rounded-full px-4 py-2 transition ${isSelected ? 'bg-(--ink) text-white' : 'text-(--muted) hover:text-(--ink)'}`}>
                      <input
                        type="radio"
                        name="verification-mode"
                        value={mode}
                        checked={isSelected}
                        onChange={() => {
                          setVerificationMode(mode);
                          setWorldIdProof(null);
                          proofCandidate.current = null;
                          setRpContext(null);
                          resetIdKit();
                          setAuthorizationState('idle');
                          setMessage(`${mode === 'selfie' ? 'Selfie Check' : 'Orb'} mode selected.`);
                        }}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  );
                })}
              </fieldset>
              {!isMounted ? (
                <div className="h-13 min-w-56 animate-pulse rounded-full border border-(--line) bg-white/55" aria-label="Loading wallet controls" />
              ) : !isConnected ? (
                <button
                  type="button"
                  onClick={() => connectors[0] !== undefined && connect({connector: connectors[0]})}
                  disabled={connectors[0] === undefined}
                  className="min-w-56 rounded-full border border-(--ink) px-6 py-4 text-sm font-semibold text-(--ink) transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Connect wallet to bind authorization
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedRequest === undefined || address === undefined) {
                      setAuthorizationState('error');
                      setMessage(`Select a request and connect a wallet before starting ${verificationLabel}.`);
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
                        body: JSON.stringify({action: 'execute-agent'}),
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
                      setMessage(`Complete ${verificationLabel} to prove a live human is authorizing this agent request.`);
                    } catch (error) {
                      setAuthorizationState('error');
                      setMessage(error instanceof Error ? error.message : 'World ID authorization could not start.');
                    }
                  }}
                  disabled={selectedRequest === undefined || authorizationState === 'preparing_rp' || worldAppId.length === 0 || worldRpId.length === 0}
                  className="min-w-56 rounded-full bg-(--ink) px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2a3a2f] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {authorizationState === 'preparing_rp' ? `Preparing ${verificationLabel}...` : `Start ${verificationLabel}`}
                </button>
              )}
              {isMounted && isConnected && address !== undefined && (
                <span className="text-xs text-(--muted)">{address.slice(0, 6)}...{address.slice(-4)}</span>
              )}
              {isMounted && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleAuthorizeOnChain()}
                    disabled={!canAuthorize || isTransactionPending}
                    className="min-w-56 rounded-full border border-(--ink) px-6 py-4 text-sm font-semibold text-(--ink) transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {authorizationState === 'submitting_tx' ? 'Binding authorization...' : authorizationState === 'waiting_for_tx' ? 'Confirming registry...' : 'Authorize agent request'}
                  </button>
                  <div className="w-full rounded-2xl border border-(--line) bg-white/45 p-3 text-left text-xs text-(--muted)" aria-label="Authorization prerequisites">
                    <p className="font-semibold uppercase tracking-[0.14em] text-(--ink)">Authorization checks</p>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {[
                        {label: 'selectedRequest', ready: hasSelectedRequest},
                        {label: 'selectedRequestId', ready: hasSelectedRequestId},
                        {label: 'selectedSecretIdentifier', ready: hasSelectedSecretIdentifier},
                        {label: 'worldIdProof', ready: hasWorldIdProof},
                        {label: 'isConnected', ready: hasWalletConnection},
                        {label: 'address', ready: hasWalletAddress},
                        {label: 'registryAddress', ready: hasRegistryAddress},
                        {label: 'authorizationState === proof_ready', ready: hasProofReadyState},
                      ].map(({label, ready}) => (
                        <span key={label} className={ready ? 'text-[#28734a]' : 'text-[#a83f31]'}>
                          {ready ? 'OK' : 'WAIT'} {label}: {String(ready)}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {rpContext !== null && (isIdKitOpen || connectorURI !== null) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(23,33,27,0.42)] p-5" role="dialog" aria-modal="true" aria-label="World ID verification">
              <div className="w-full max-w-2xl rounded-3xl border border-(--line) bg-(--paper) p-4 text-sm shadow-[0_24px_80px_rgba(23,33,27,0.28)] sm:p-6" aria-live="polite">
              <div className="grid gap-5 sm:grid-cols-[280px_1fr] sm:items-center">
                <div className="flex min-h-70 items-center justify-center rounded-xl bg-white p-3">
                  {qrDataUrl === null ? (
                    <p className="text-center text-xs text-(--muted)">Preparing QR code...</p>
                  ) : (
                    <img src={qrDataUrl} alt="World ID connection QR code" className="h-64 w-64" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-(--ink)">World ID verification</p>
                  <p className="mt-1 leading-6 text-(--muted)">
                    Scan the QR code with the World ID Simulator, or copy the Simulator link to the testing device.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopySimulatorLink()}
                  className="rounded-full border border-(--ink) px-4 py-2 text-xs font-semibold text-(--ink) transition hover:bg-white"
                >
                  {simulatorCopyState === 'copied' ? 'Copied!' : simulatorCopyState === 'error' ? 'Copy failed' : 'Copy Simulator Link'}
                </button>
                {simulatorUrl !== null && (
                  <a
                    href={simulatorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-(--ink) px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#2a3a2f]"
                  >
                    Open World ID Simulator
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    resetIdKit();
                    setRpContext(null);
                    setAuthorizationState('idle');
                    setMessage('World ID authorization cancelled.');
                  }}
                  className="rounded-full px-4 py-2 text-xs font-semibold text-(--muted) transition hover:bg-white hover:text-(--ink)"
                >
                  Cancel
                </button>
                  </div>
                  {simulatorCopyState === 'error' && (
                    <p className="mt-2 text-xs text-[#a83f31]">Clipboard access failed. Copy the Simulator link manually from the browser address bar.</p>
                  )}
                </div>
              </div>
            </div>
            </div>
          )}
        </section>

        <section className="mt-6 border-t border-(--line) pt-6" aria-live="polite">
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Execution feedback</p>
              <p className="mt-2 text-2xl">
                {authorizationState === 'success' ? 'Capability complete.' : executionStatus === 'executing' ? 'Authorized request is executing.' : 'Awaiting human authorization.'}
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
                  After the registry confirms the human authorization event, the chain listener executes the scoped capability and returns a sanitized result here.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
