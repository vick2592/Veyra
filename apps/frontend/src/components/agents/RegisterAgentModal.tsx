'use client';

import { useState } from 'react';
import { isAddress } from 'viem';
import { Modal } from '@/components/ui/Modal';

export function RegisterAgentModal({
  open,
  onClose,
  onRegister,
}: {
  open: boolean;
  onClose: () => void;
  onRegister: (agent: { address: string; label: string }) => void;
}) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setAddress('');
    setLabel('');
    setError(null);
    onClose();
  }

  function handleSubmit() {
    const trimmedAddress = address.trim();
    const trimmedLabel = label.trim();
    if (!isAddress(trimmedAddress)) {
      setError('Enter a valid wallet address (0x...).');
      return;
    }
    if (trimmedLabel.length === 0) {
      setError('Give this agent a name.');
      return;
    }
    onRegister({ address: trimmedAddress, label: trimmedLabel });
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <h2 className="text-2xl font-semibold text-(--dark-500)">Register agent</h2>
      <p className="mt-2 text-sm leading-6 text-(--dark-300)">
        Adds this agent to your own list, on this device. It doesn&apos;t grant it access —
        any address can already request access to your secrets; a human still decides per request.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="agent-address" className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
            Agent address
          </label>
          <input
            id="agent-address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x..."
            className="mt-2 w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 font-mono text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="agent-label" className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
            Name
          </label>
          <input
            id="agent-label"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Portfolio Agent"
            className="mt-2 w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none"
          />
        </div>

        {error !== null && <p className="text-sm text-(--dark-400)">{error}</p>}
      </div>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
        >
          Register agent
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 rounded-full border border-(--purple-500) px-6 py-4 text-sm font-semibold text-(--purple-500) transition hover:bg-(--purple-500)/10"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
