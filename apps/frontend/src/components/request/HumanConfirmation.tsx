'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { selfieCheckLegacy, useIDKitRequest, type RpContext } from '@worldcoin/idkit';
import { HugeiconsIcon } from '@hugeicons/react';
import { IdVerifiedIcon, LockKeyIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';
import { sendApprovalNotification } from '@/lib/notifications';
import {
  getOnChainProof,
  getSecretId,
  getSimulatorUrl,
  getWorldIdSignal,
  registryAbi,
  registryAddress,
} from '@/lib/worldIdAuthorization';
import type { AccessRequest } from './AccessRequestModal';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const worldAppId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? '';
const worldRpId = process.env.NEXT_PUBLIC_WORLD_ID_RP_ID ?? '';
const CONFIRMATION_WINDOW_SECONDS = 120;

type ConfirmStage =
  | 'awaiting_world_id'
  | 'preparing_world_id'
  | 'world_id_open'
  | 'awaiting_wallet_signature'
  | 'submitting_tx'
  | 'waiting_for_tx';

export function HumanConfirmation({
  request,
  onApproved,
  onDenied,
}: {
  request: AccessRequest;
  onApproved: (txHash: `0x${string}`) => void;
  onDenied: (reason: 'user_denied' | 'expired') => void;
}) {
  const narrative = getActionNarrative(request.secretIdentifier);
  const agentLabel = getAgentLabel(request.agentAddress);

  const [stage, setStage] = useState<ConfirmStage>('awaiting_world_id');
  const [secondsLeft, setSecondsLeft] = useState(CONFIRMATION_WINDOW_SECONDS);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasSettled = useRef(false);
  const proofRef = useRef<ReturnType<typeof getOnChainProof> | null>(null);

  // Real desktop notification (Settings' toggle), matching Page 07's own
  // trigger point — fires once, when a confirmation actually opens.
  useEffect(() => {
    const detail = narrative.detail.length > 0 ? ` ${narrative.detail}` : '';
    sendApprovalNotification(
      'Veyra: approval needed',
      `${agentLabel} wants ${narrative.headline}${detail}. Expires in ${CONFIRMATION_WINDOW_SECONDS}s.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const { isSuccess: isTxConfirmed, isError: isTxError, error: txError } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    confirmations: 1,
  });

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
    rp_context: rpContext ?? { rp_id: worldRpId, nonce: '', created_at: 0, expires_at: 0, signature: '' },
    environment: 'staging',
    allow_legacy_proofs: true,
    preset: selfieCheckLegacy({
      signal: getWorldIdSignal(
        (address ?? '0x0000000000000000000000000000000000000002') as `0x${string}`,
        request.agentAddress as `0x${string}`,
        getSecretId(request.secretIdentifier),
      ),
    }),
  });
  const simulatorUrl = connectorURI === null ? null : getSimulatorUrl(connectorURI);

  // Countdown — denies as `expired` once it hits zero, unless a wallet
  // signature is already in flight (the on-chain tx is the point past which
  // backing out stops making sense).
  useEffect(() => {
    if (hasSettled.current) {
      return;
    }
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1 && (stage === 'awaiting_world_id' || stage === 'preparing_world_id' || stage === 'world_id_open' || stage === 'awaiting_wallet_signature')) {
          hasSettled.current = true;
          onDenied('expired');
          return 0;
        }
        return Math.max(current - 1, 0);
      });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [stage, onDenied]);

  useEffect(() => {
    if (rpContext === null || isIdKitOpen) {
      return;
    }
    openIdKit();
    setStage('world_id_open');
  }, [rpContext, isIdKitOpen, openIdKit]);

  useEffect(() => {
    if (!isIdKitSuccess || idKitResult === null) {
      return;
    }
    try {
      const proof = getOnChainProof(idKitResult);
      resetIdKit();
      setRpContext(null);
      setErrorMessage(null);
      setStage('awaiting_wallet_signature');
      proofRef.current = proof;
    } catch (error) {
      resetIdKit();
      setRpContext(null);
      setStage('awaiting_world_id');
      setErrorMessage(error instanceof Error ? error.message : 'World ID proof could not be normalized.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKitResult, isIdKitSuccess]);

  useEffect(() => {
    if (!isIdKitError || idKitErrorCode === null) {
      return;
    }
    resetIdKit();
    setRpContext(null);
    setStage('awaiting_world_id');
    setErrorMessage(`World ID verification failed: ${idKitErrorCode}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIdKitError, idKitErrorCode]);

  useEffect(() => {
    if (connectorURI === null) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    void QRCode.toDataURL(connectorURI, { margin: 2, width: 240 })
      .then((dataUrl) => active && setQrDataUrl(dataUrl))
      .catch(() => active && setQrDataUrl(null));
    return () => {
      active = false;
    };
  }, [connectorURI]);

  useEffect(() => {
    if (isTxConfirmed && txHash !== null && !hasSettled.current) {
      hasSettled.current = true;
      onApproved(txHash);
    }
  }, [isTxConfirmed, txHash, onApproved]);

  useEffect(() => {
    if (isTxError && txError !== null) {
      setStage('awaiting_wallet_signature');
      setErrorMessage(txError.message);
    }
  }, [isTxError, txError]);

  async function handleStartWorldId() {
    setErrorMessage(null);
    setStage('preparing_world_id');
    try {
      const response = await fetch(`${backendUrl}/api/world-id/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'execute-agent' }),
      });
      const body = (await response.json().catch(() => null)) as Partial<RpContext> & { error?: string } | null;
      if (!response.ok || body === null || body.rp_id === undefined || body.nonce === undefined || body.created_at === undefined || body.expires_at === undefined || body.signature === undefined) {
        throw new Error(body?.error ?? 'The broker could not prepare World ID authorization.');
      }
      setRpContext({
        rp_id: body.rp_id,
        nonce: body.nonce,
        created_at: body.created_at,
        expires_at: body.expires_at,
        signature: body.signature,
      });
    } catch (error) {
      setStage('awaiting_world_id');
      setErrorMessage(error instanceof Error ? error.message : 'World ID authorization could not start.');
    }
  }

  async function handleConfirmInWallet() {
    if (proofRef.current === null || address === undefined || registryAddress === undefined) {
      setErrorMessage('World ID proof, wallet, or registry address is missing.');
      return;
    }
    setErrorMessage(null);
    setStage('submitting_tx');
    try {
      const hash = await writeContractAsync({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'authorizeAgent',
        args: [
          request.agentAddress as `0x${string}`,
          getSecretId(request.secretIdentifier),
          BigInt(proofRef.current.root),
          BigInt(proofRef.current.nullifierHash),
          proofRef.current.proof.map((value) => BigInt(value)) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          request.requestId as `0x${string}`,
        ],
      });
      setTxHash(hash);
      setStage('waiting_for_tx');
    } catch (error) {
      setStage('awaiting_wallet_signature');
      setErrorMessage(error instanceof Error ? error.message : 'Wallet signature failed.');
    }
  }

  function handleDeny() {
    if (hasSettled.current) {
      return;
    }
    hasSettled.current = true;
    onDenied('user_denied');
  }

  const canDeny = stage === 'awaiting_world_id' || stage === 'preparing_world_id' || stage === 'awaiting_wallet_signature';

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-(--dark-400)">Confirm this action</p>
          <p className="mt-1 text-xs text-(--dark-300)">{agentLabel} · {request.secretIdentifier}</p>
        </div>
        <CountdownRing secondsLeft={secondsLeft} totalSeconds={CONFIRMATION_WINDOW_SECONDS} />
      </div>

      <div>
        <p className="text-2xl font-semibold text-(--blue-500)">{narrative.headline}</p>
        {narrative.detail.length > 0 && <p className="mt-1 text-sm text-(--dark-300)">{narrative.detail}</p>}
        <p className="mt-1 font-mono text-xs text-(--dark-300)">{narrative.technical}</p>
      </div>

      <p className="rounded-2xl border border-(--dark-50) bg-(--creame) px-4 py-3 text-sm font-semibold text-(--dark-400)">
        This can&apos;t be undone once approved.
      </p>

      <div className="flex flex-col gap-4 rounded-2xl border border-(--dark-50) p-4">
        <div className="flex items-start gap-3">
          <StepMarker complete={stage !== 'awaiting_world_id' && stage !== 'preparing_world_id' && stage !== 'world_id_open'} number={1} />
          <div>
            <p className="text-sm font-semibold text-(--dark-400)">Verify it&apos;s you</p>
            <p className="text-xs text-(--dark-300)">A quick liveness check. It doesn&apos;t share your identity with the agent.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <StepMarker complete={stage === 'submitting_tx' || stage === 'waiting_for_tx'} number={2} />
          <div>
            <p className="text-sm font-semibold text-(--dark-400)">Sign to approve</p>
            <p className="text-xs text-(--dark-300)">Your wallet signs this exact action. Veyra never sees your private key.</p>
          </div>
        </div>
      </div>

      {errorMessage !== null && <p className="text-sm text-(--dark-400)">{errorMessage}</p>}

      <div className="flex items-center gap-4">
        {stage === 'awaiting_wallet_signature' || stage === 'submitting_tx' || stage === 'waiting_for_tx' ? (
          <Button
            variant="primary"
            icon={LockKeyIcon}
            loading={stage === 'submitting_tx' || stage === 'waiting_for_tx'}
            loadingLabel={stage === 'submitting_tx' ? 'Confirming in wallet...' : 'Waiting for confirmation...'}
            onClick={() => void handleConfirmInWallet()}
          >
            Confirm in wallet
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={IdVerifiedIcon}
            loading={stage === 'preparing_world_id' || stage === 'world_id_open'}
            loadingLabel="Confirming with World ID..."
            disabled={worldAppId.length === 0 || worldRpId.length === 0 || address === undefined}
            onClick={() => void handleStartWorldId()}
          >
            Confirm with World ID
          </Button>
        )}
        {canDeny && (
          <button type="button" onClick={handleDeny} className="text-sm font-semibold text-(--dark-300) hover:text-(--dark-400)">
            Deny
          </button>
        )}
      </div>

      {rpContext !== null && (isIdKitOpen || connectorURI !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,8,19,0.5)] p-5" role="dialog" aria-modal="true" aria-label="World ID verification">
          <div className="w-full max-w-md rounded-3xl border border-(--dark-50) bg-white p-6 text-sm shadow-[0_24px_80px_rgba(4,8,19,0.28)]">
            <div className="flex min-h-60 items-center justify-center rounded-xl bg-(--creame) p-3">
              {qrDataUrl === null ? (
                <p className="text-center text-xs text-(--dark-300)">Preparing QR code...</p>
              ) : (
                <img src={qrDataUrl} alt="World ID connection QR code" className="h-56 w-56" />
              )}
            </div>
            <p className="mt-4 font-semibold text-(--dark-400)">World ID verification</p>
            <p className="mt-1 text-(--dark-300)">Scan with the World ID Simulator, or open it directly below.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {simulatorUrl !== null && (
                <a
                  href={simulatorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-(--purple-500) px-4 py-2 text-xs font-semibold text-white"
                >
                  Open World ID Simulator
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  resetIdKit();
                  setRpContext(null);
                  setStage('awaiting_world_id');
                }}
                className="rounded-full px-4 py-2 text-xs font-semibold text-(--dark-300) hover:text-(--dark-400)"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Real urgency cue, not decoration — the original spec called for "a ring
 * or bar, not a bare number" here and it never got built until now. Purple,
 * not red: the locked palette has no 5th/error color, so urgency reads
 * through motion and depletion, not a color change.
 */
function CountdownRing({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(secondsLeft, 0) / totalSeconds;
  const offset = circumference * (1 - progress);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="relative flex h-11 w-11 items-center justify-center">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="3" className="stroke-(--dark-50)" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-(--purple-500) transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-(--dark-400)">
        {minutes}:{seconds}
      </span>
    </div>
  );
}

function StepMarker({ number, complete }: { number: number; complete: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${
        complete ? 'animate-veyra-pop-in bg-(--purple-500) text-white' : 'border border-(--dark-50) text-(--dark-300)'
      }`}
    >
      {complete ? <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} /> : number}
    </span>
  );
}
