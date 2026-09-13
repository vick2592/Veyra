'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { TransactionStatus, type TransactionStep } from '@/components/ui/TransactionStatus';
import { useAddSecret } from '@/hooks/useAddSecret';
import { useRequiredChain } from '@/hooks/useRequiredChain';

const ADD_SECRET_STEPS: TransactionStep[] = ['encrypting', 'wallet', 'mining', 'success'];

export function AddSecretModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [plaintextValue, setPlaintextValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { stage, errorMessage, addSecret, reset } = useAddSecret();
  const { isWrongChain, isSwitching: isSwitchingChain, requiredChainName, switchToRequiredChain } = useRequiredChain();
  const isBusy = stage === 'encrypting' || stage === 'preparing' || stage === 'awaiting_signature' || stage === 'pending';
  const activeStep: TransactionStep | null =
    stage === 'encrypting'
      ? 'encrypting'
      : stage === 'preparing' || stage === 'awaiting_signature'
        ? 'wallet'
        : stage === 'pending'
          ? 'mining'
          : stage === 'confirmed'
            ? 'success'
            : null;

  useEffect(() => {
    if (stage === 'confirmed') {
      onCreated();
      handleClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function handleClose() {
    setName('');
    setPlaintextValue('');
    setValidationError(null);
    reset();
    onClose();
  }

  function handleSubmit() {
    if (name.trim().length === 0) {
      setValidationError('Give this secret a name.');
      return;
    }
    if (plaintextValue.trim().length === 0) {
      setValidationError('Paste the key or value to encrypt.');
      return;
    }
    setValidationError(null);
    void addSecret(name, plaintextValue);
  }

  return (
    <Modal open={open} onClose={isBusy ? undefined : handleClose}>
      <h2 className="text-2xl font-semibold text-(--dark-500)">Add secret</h2>
      <p className="mt-2 text-sm leading-6 text-(--dark-300)">
        Creates a real, on-chain scoped secret an agent can request access to — it never holds the raw value.
      </p>

      <div className="mt-6">
        <label htmlFor="new-secret-name" className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
          Name
        </label>
        <input
          id="new-secret-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isBusy}
          placeholder="openai-key"
          className="mt-2 w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="new-secret-value" className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
          Value
        </label>
        <input
          id="new-secret-value"
          type="password"
          autoComplete="off"
          value={plaintextValue}
          onChange={(event) => setPlaintextValue(event.target.value)}
          disabled={isBusy}
          placeholder="sk-..."
          className="mt-2 w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
        />
        <p className="mt-2 text-xs text-(--dark-300)">
          Encrypted by the hardware key ring before anything reaches the chain — this value is never stored as plaintext.
        </p>
        {(validationError ?? (stage === 'error' ? errorMessage : null)) !== null && (
          <p className="mt-2 text-sm text-(--dark-400)">{validationError ?? errorMessage}</p>
        )}
      </div>

      {activeStep !== null && (
        <div className="mt-4">
          <TransactionStatus steps={ADD_SECRET_STEPS} active={activeStep} />
        </div>
      )}

      {isWrongChain && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => switchToRequiredChain()}
            disabled={isSwitchingChain}
            className="rounded-full border border-(--purple-500) px-4 py-2 text-xs font-semibold text-(--purple-500) transition hover:bg-(--purple-500)/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSwitchingChain ? 'Switching network...' : `Switch to ${requiredChainName}`}
          </button>
          <p className="text-xs text-(--dark-300)">Wrong network for creating a secret.</p>
        </div>
      )}

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isBusy || isWrongChain}
          className="flex-1 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {stage === 'encrypting'
            ? 'Encrypting...'
            : stage === 'preparing' || stage === 'awaiting_signature'
              ? 'Confirm in wallet...'
              : stage === 'pending'
                ? 'Confirming...'
                : 'Add secret'}
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={isBusy}
          className="flex-1 rounded-full border border-(--purple-500) px-6 py-4 text-sm font-semibold text-(--purple-500) transition hover:bg-(--purple-500)/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
