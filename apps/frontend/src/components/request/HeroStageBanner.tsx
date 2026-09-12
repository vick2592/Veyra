import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { Alert02Icon, IdVerifiedIcon, SecuredNetworkIcon, Tick02Icon } from '@hugeicons/core-free-icons';

type FlowStage = 'policy_result' | 'confirmation' | 'approved' | 'denied';

const denyCaptions: Record<'user_denied' | 'expired', string> = {
  user_denied: 'Action denied',
  expired: 'No response in time',
};

/**
 * Mirrors the active stage's own headline in the dark panel — an ambient
 * echo of what the content pane already says, not a second detailed status.
 * Keeps the panel from being an empty gradient through the whole /request
 * flow, which has no photo asset of its own (see SplitScreenShell).
 */
export function HeroStageBanner({
  stage,
  deniedReason,
}: {
  stage: FlowStage;
  deniedReason: 'user_denied' | 'expired' | null;
}) {
  const { icon, solid, caption } = ((): { icon: IconSvgElement; solid: boolean; caption: string } => {
    switch (stage) {
      case 'policy_result':
        return { icon: SecuredNetworkIcon, solid: false, caption: 'Request evaluated' };
      case 'confirmation':
        return { icon: IdVerifiedIcon, solid: false, caption: 'Confirm this action' };
      case 'approved':
        return { icon: Tick02Icon, solid: true, caption: 'Approved — finishing up' };
      case 'denied':
        return { icon: Alert02Icon, solid: false, caption: deniedReason !== null ? denyCaptions[deniedReason] : 'Access denied' };
    }
  })();

  return (
    <>
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          solid ? 'bg-(--purple-500) text-white' : 'border border-white/25 text-white'
        }`}
      >
        <HugeiconsIcon icon={icon} size={26} strokeWidth={1.5} />
      </span>
      <p className="text-lg font-semibold text-white">{caption}</p>
    </>
  );
}
