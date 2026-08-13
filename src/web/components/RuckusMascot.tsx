/**
 * Ruckus brand marks — hand-authored inline SVG, no binary assets.
 *
 * The mascot is a duck with a megaphone and a clipboard on a purple badge:
 * white body with navy ink outlines, violet megaphone, rounded joins throughout.
 * `RuckusDuckMark` is the compact head-only lockup used in nav bars and the
 * product mock sidebar.
 */

const INK = "#02162E";           // sampled from the logo artwork
const VIOLET = "#7120DF";        // sampled from the logo artwork
const VIOLET_BADGE = "#3F1090";  // darker badge so the purple bill reads
const VIOLET_DEEP = "#6D28D9";
const VIOLET_DARK = "#5B21B6";
const VIOLET_SOFT = "#A78BFA";
const BILL = VIOLET;             // the logo's bill is purple, not amber

export function RuckusMascot({
  className = "h-40 w-40",
  title = "Ruckus mascot: a duck with a megaphone and a clipboard",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      fill="none"
      stroke={INK}
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Badge backdrop */}
      <circle cx="120" cy="120" r="116" fill={VIOLET_DEEP} stroke="none" />
      <circle cx="120" cy="120" r="106" fill={VIOLET} stroke="none" />
      <circle cx="120" cy="120" r="106" stroke={VIOLET_SOFT} strokeWidth={3} opacity={0.55} />

      {/* Sound bursts — radiating out of the megaphone mouth, on the bill side */}
      <path d="M34 114c-5 3-6 8-5 13M28 104c-7 5-10 15-8 25" strokeWidth={6} stroke="#FFFFFF" />

      {/* Feet */}
      <path d="M104 186c-2 10-8 14-16 16 6 6 18 7 26 2z" fill={BILL} />
      <path d="M138 188c0 10 4 15 12 18-5 7-17 9-26 5z" fill={BILL} />

      {/* Body */}
      <path d="M120 96c30 0 50 22 50 52 0 26-22 44-50 44s-50-18-50-44c0-30 20-52 50-52z" fill="#FFFFFF" />
      {/* Wing */}
      <path d="M92 146c12-6 24-2 30 10-6 12-18 17-28 12-6-3-8-16-2-22z" fill="#F4F1FF" />

      {/* Clipboard, tucked under the far wing */}
      <rect x="140" y="138" width="48" height="58" rx="10" fill="#FFFFFF" />
      <rect x="154" y="130" width="22" height="14" rx="6" fill={VIOLET_SOFT} />
      <path d="M152 162h24M152 176h16" strokeWidth={5} />

      {/* Lanyard + code badge */}
      <path d="M100 116l8 26M126 114l-4 28" strokeWidth={5} />
      <rect x="100" y="140" width="34" height="24" rx="7" fill={VIOLET_SOFT} />
      <path d="M112 148l-5 4 5 4M123 148l5 4-5 4" strokeWidth={4} />

      {/* Head, three-quarter turn toward the bill side */}
      <circle cx="112" cy="80" r="36" fill="#FFFFFF" />
      {/* Tuft */}
      <path d="M106 46c2-10 10-14 18-12-6 4-8 8-7 14" strokeWidth={5} />
      {/* Bill */}
      <path d="M78 76H56a10 10 0 0 0 0 20h22z" fill={BILL} />
      <path d="M58 86h16" strokeWidth={4} />
      {/* Raised brow + eye */}
      <path d="M88 60c5-4 13-4 18-1" strokeWidth={5} />
      <ellipse cx="97" cy="75" rx="7" ry="8" fill={INK} stroke="none" />
      <circle cx="99.5" cy="72" r="2.4" fill="#FFFFFF" stroke="none" />

      {/* Arm + megaphone, raised on the same side as the bill */}
      <path d="M104 150l-12-10" strokeWidth={9} />
      <path d="M100 132 L48 106 L38 140 L96 150 Z" fill={VIOLET_DARK} />
      {/* Mouth opening */}
      <ellipse cx="43" cy="123" rx="7" ry="18" transform="rotate(-16 43 123)" fill={VIOLET_SOFT} strokeWidth={5} />
      {/* Barrel highlight */}
      <path d="M78 124l-5 20" strokeWidth={5} stroke={VIOLET_SOFT} opacity={0.85} />

      {/* Sparkles */}
      <path d="M188 52l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFFFFF" stroke="none" opacity={0.9} />
      <path d="M60 186l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFFFFF" stroke="none" opacity={0.75} />
    </svg>
  );
}

export function RuckusDuckMark({ className = "h-9 w-9", title = "Ruckus" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      fill="none"
      stroke={INK}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="24" cy="24" r="24" fill={VIOLET_BADGE} stroke="none" />
      {/* crest feather */}
      <path d="M29.6 8c0.2-4.8 3.4-6.7 6.5-5.3-2.6 2-3.6 4.1-2.6 6.5z" fill="#FFFFFF" />
      {/* head */}
      <circle cx="27.6" cy="20" r="12.2" fill="#FFFFFF" />
      {/* open bill: thin mouth cavity between two chunky purple mandibles */}
      <path d="M23 27.6 10.4 31.4 12.8 34.4 23 31.8Z" fill={INK} />
      <path d="M22.6 20.4C16.4 22.6 11 25.8 7.7 28.6c-1.1 1-0.4 2.8 1 2.9l14.1-3.2z" fill={VIOLET} />
      <path d="M23 30.6 11.4 35.2c-1.3 0.5-0.9 2.5 0.5 2.7 4.6 0.5 8.9-1.1 12.4-3.9z" fill={VIOLET} />
      {/* raised brow + big eye */}
      <path d="M28 14c1.7-1.4 4.5-1.5 6.2-0.2" strokeWidth={2.2} />
      <ellipse cx="31" cy="20.2" rx="3.4" ry="4" fill={INK} stroke="none" />
      <circle cx="32.2" cy="18.7" r="1.4" fill="#FFFFFF" stroke="none" />
    </svg>
  );
}

export function RuckusWordmark({
  className = "",
  showTagline = false,
  compact = false,
}: {
  className?: string;
  showTagline?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <RuckusDuckMark className={compact ? "h-7 w-7" : "h-9 w-9"} />
      <span className="min-w-0">
        <span
          className={`block font-display font-extrabold leading-none tracking-tight text-navy ${
            compact ? "text-[16px]" : "text-[20px]"
          }`}
        >
          Ruckus
        </span>
        {showTagline ? (
          <span className="mt-0.5 block truncate text-[10px] font-medium uppercase tracking-[0.12em] text-mid">
            Open-source conference management
          </span>
        ) : null}
      </span>
    </span>
  );
}
