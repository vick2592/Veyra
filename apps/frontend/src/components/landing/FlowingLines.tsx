const LINE_COUNT = 7;

/** A handful of diagonal sweeping curves, staggered by index — same family
 * of shape, not 36 individually hand-tuned paths (the effect this was
 * inspired by uses that many; that's real cost for a decorative background
 * with no payoff past a certain density). */
function buildPath(index: number): string {
  const offset = index * 26;
  const y = 640 - index * 46;
  return `M${-120 - offset},${y} C${180 - offset},${y - 80} ${520 - offset},${300 - index * 30} ${860 - offset},${230 - index * 40} S${1260 - offset},${90 - index * 20} ${1360 - offset},${40 - index * 10}`;
}

/**
 * Brand-colored flowing lines behind the landing page — replaces the earlier
 * two-blob drift. Pure SVG + one CSS keyframe animating stroke-dashoffset
 * (see globals.css, .animate-veyra-line-flow) — no framer-motion, no new
 * dependency, same performance profile as the rest of this app's ambient
 * motion (all plain CSS keyframes already).
 */
export function FlowingLines() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      {Array.from({ length: LINE_COUNT }, (_, index) => (
        <path
          key={index}
          d={buildPath(index)}
          stroke={index % 2 === 0 ? 'var(--purple-500)' : 'var(--blue-500)'}
          strokeWidth={1 + index * 0.15}
          strokeLinecap="round"
          className="animate-veyra-line-flow"
          style={{
            opacity: 0.1 + index * 0.02,
            animationDelay: `${index * -3.5}s`,
            animationDuration: `${26 + index * 4}s`,
          }}
        />
      ))}
    </svg>
  );
}
