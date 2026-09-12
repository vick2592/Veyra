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
  const { icon, tone, caption } = ((): { icon: IconSvgElement; tone: 'neutral' | 'success' | 'danger'; caption: string } => {
    switch (stage) {
      case 'policy_result':
        return { icon: SecuredNetworkIcon, tone: 'neutral', caption: 'Request evaluated' };
      case 'confirmation':
        return { icon: IdVerifiedIcon, tone: 'neutral', caption: 'Confirm this action' };
      case 'approved':
        return { icon: Tick02Icon, tone: 'success', caption: 'Approved — finishing up' };
      case 'denied':
        return { icon: Alert02Icon, tone: 'danger', caption: deniedReason !== null ? denyCaptions[deniedReason] : 'Access denied' };
    }
  })();

  const toneClasses: Record<typeof tone, string> = {
    neutral: 'border border-white/25 text-white',
    success: 'bg-(--purple-500) text-white',
    // Denied previously shared the same muted outline as the neutral,
    // in-progress stages — reading as disabled rather than as the one
    // outcome most worth noticing. Solid red gives it equal visual
    // weight to the success state instead of fading into the background.
    danger: 'bg-[#DC2626] text-white',
  };

  return (
    <>
      <span className={`flex h-16 w-16 items-center justify-center rounded-full ${toneClasses[tone]}`}>
        <HugeiconsIcon icon={icon} size={26} strokeWidth={1.5} />
      </span>
      <p className="text-lg font-semibold text-white">{caption}</p>
    </>
  );
}
