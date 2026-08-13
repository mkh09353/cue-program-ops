/**
 * Ruckus brand marks — hand-authored inline SVG, no binary assets.
 *
 * The mascot is a duck with a megaphone and a clipboard on a purple badge:
 * white body with navy ink outlines, violet megaphone, rounded joins throughout.
 * `RuckusDuckMark` is the compact head-only lockup used in nav bars and the
 * product mock sidebar.
 */

const INK = "#1E1B2E";
const VIOLET = "#7C3AED";
const VIOLET_DEEP = "#6D28D9";
const VIOLET_SOFT = "#A78BFA";
const BILL = "#FBBF24";

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

      {/* Feet */}
      <path d="M96 186c-2 10-8 14-16 16 6 6 18 7 26 2z" fill={BILL} />
      <path d="M134 188c0 10 4 15 12 18-5 7-17 9-26 5z" fill={BILL} />

      {/* Body */}
      <path d="M120 96c30 0 50 22 50 52 0 26-22 44-50 44s-50-18-50-44c0-30 20-52 50-52z" fill="#FFFFFF" />
      {/* Wing */}
      <path d="M96 140c14-6 26-2 32 10-6 12-18 17-30 12-6-3-8-14-2-22z" fill="#F4F1FF" />

      {/* Clipboard */}
      <rect x="58" y="140" width="46" height="56" rx="10" fill="#FFFFFF" />
      <rect x="70" y="132" width="22" height="14" rx="6" fill={VIOLET_SOFT} />
      <path d="M70 162h22M70 176h14" strokeWidth={5} />

      {/* Lanyard + code badge */}
      <path d="M108 116l6 26M132 114l-4 28" strokeWidth={5} />
      <rect x="106" y="140" width="34" height="24" rx="7" fill={VIOLET_SOFT} />
      <path d="M118 148l-5 4 5 4M129 148l5 4-5 4" strokeWidth={4} />

      {/* Head */}
      <circle cx="118" cy="80" r="36" fill="#FFFFFF" />
      {/* Tuft */}
      <path d="M112 46c2-10 10-14 18-12-6 4-8 8-7 14" strokeWidth={5} />
      {/* Bill */}
      <path d="M84 76H62a10 10 0 0 0 0 20h22z" fill={BILL} />
      <path d="M64 86h16" strokeWidth={4} />
      {/* Eye */}
      <circle cx="108" cy="72" r="6" fill={INK} stroke="none" />
      <circle cx="110.5" cy="69.5" r="2" fill="#FFFFFF" stroke="none" />

      {/* Arm + megaphone */}
      <path d="M148 138l14-12" strokeWidth={9} />
      <path d="M160 130l38-26a10 10 0 0 1 15 5l10 34a10 10 0 0 1-11 13l-46-8a10 10 0 0 1-6-18z" fill={VIOLET_DEEP} />
      <path d="M176 118l12 40" strokeWidth={5} opacity={0.9} />

      {/* Sound bursts */}
      <path d="M212 66c10 6 14 16 12 28M220 50c13 10 17 26 11 42" strokeWidth={6} stroke="#FFFFFF" />

      {/* Sparkles */}
      <path d="M52 62l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFFFFF" stroke="none" opacity={0.9} />
      <path d="M196 194l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFFFFF" stroke="none" opacity={0.75} />
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
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="24" cy="24" r="24" fill={VIOLET} stroke="none" />
      <circle cx="26" cy="25" r="13" fill="#FFFFFF" />
      <path d="M22 10c1-4 4-5 7-4-2 2-3 3-2 5" strokeWidth={2.2} />
      <path d="M13 22H7a4 4 0 0 0 0 8h6z" fill={BILL} />
      <circle cx="21" cy="21" r="2.6" fill={INK} stroke="none" />
      <circle cx="22" cy="20" r="0.9" fill="#FFFFFF" stroke="none" />
      <path d="M36 12l1.6 4L42 17.6l-4.4 1.6L36 23l-1.6-3.8L30 17.6 34.4 16z" fill="#FFFFFF" stroke="none" opacity={0.9} />
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
