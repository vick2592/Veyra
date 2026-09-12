/**
 * viem's BaseError (thrown by wagmi's write/read hooks) carries a
 * `.shortMessage` — one plain sentence — separate from `.message`, which
 * dumps the full contract call args, docs link, and library version. Every
 * catch block in this app used to show `.message` straight to the user,
 * which for a reverted tx or a rejected signature reads as a stack trace,
 * not a sentence a non-technical approver can act on.
 */
export function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const shortMessage = (error as {shortMessage?: unknown}).shortMessage;
    if (typeof shortMessage === 'string' && shortMessage.length > 0) {
      return shortMessage;
    }
    return error.message;
  }
  return fallback;
}
