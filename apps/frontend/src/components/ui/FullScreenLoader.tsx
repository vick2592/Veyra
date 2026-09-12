/** Shown while useSetupStatus resolves, on Landing and Setup — avoids
 * flashing marketing/form content at a wallet that's about to reconnect
 * and get redirected straight to /agents. */
export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-(--creame)">
      <span className="relative flex h-10 w-10 items-center justify-center" role="status" aria-label="Loading">
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-(--dark-50)" />
        <span aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-4 border-(--purple-500) border-t-transparent" />
      </span>
      <div style={{ width: 28, height: 24 }}>
        <img src="/veyra-mark-dark.svg" alt="" className="h-full w-full object-contain opacity-60" />
      </div>
    </div>
  );
}
