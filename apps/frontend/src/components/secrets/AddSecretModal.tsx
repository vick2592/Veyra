'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCreateSecret } from '@/hooks/useCreateSecret';

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
  const [validationError, setValidationError] = useState<string | null>(null);
  const { state, errorMessage, createSecret, reset } = useCreateSecret();
  const isBusy = state === 'registering' || state === 'storing';

  useEffect(() => {
    if (state === 'done') {
      onCreated();
      handleClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleClose() {
    setName('');
    setValidationError(null);
    reset();
    onClose();
  }

  function handleSubmit() {
    if (name.trim().length === 0) {
      setValidationError('Give this secret a name.');
      return;
    }
    setValidationError(null);
    void createSecret(name);
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
        {(validationError ?? (state === 'error' ? errorMessage : null)) !== null && (
          <p className="mt-2 text-sm text-(--dark-400)">{validationError ?? errorMessage}</p>
        )}
      </div>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isBusy}
          className="flex-1 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {state === 'registering' ? 'Registering...' : state === 'storing' ? 'Creating...' : 'Add secret'}
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
