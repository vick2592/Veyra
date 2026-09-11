import type { ReactNode } from 'react';

type SplitScreenShellProps = {
  /** Path to a hero image (e.g. a product photo). Omit for the gradient-only
   * treatment — confirmed by the built "Action approved" Figma frame, which
   * uses no photo, so every undesigned outcome screen can reuse this without
   * needing a new image asset. */
  heroImage?: string;
  children: ReactNode;
};

export function SplitScreenShell({ heroImage, children }: SplitScreenShellProps) {
  return (
    <main className="min-h-screen bg-(--creame) p-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1920px] flex-col gap-4 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-[32px] bg-(--dark-500) lg:max-w-[47%]">
          {heroImage !== undefined ? (
            <>
              <img
                src={heroImage}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* Real photos vary in tone — this keeps the white logo/wordmark
                  legible regardless of what sits behind it, unlike the
                  gradient-only treatment which was already dark by design. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/25"
              />
            </>
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 30% 75%, rgba(122,93,255,0.55), transparent 60%), radial-gradient(circle at 70% 25%, rgba(0,51,255,0.45), transparent 55%)',
              }}
            />
          )}
          <div className="relative flex items-center gap-3 p-8">
            <div style={{ width: 32, height: 28 }}>
              <img
                src="/veyra-mark.svg"
                alt="Veyra"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-lg font-semibold tracking-wide text-white">
              Veyra
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[786px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
