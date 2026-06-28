import Image from "next/image";

type InstituteBrandProps = {
  /** Smaller text for dashboard sidebars and exam headers */
  compact?: boolean;
  className?: string;
  /** Render light text + a light logo chip for use on a dark/brand-blue surface */
  onDark?: boolean;
};

export function InstituteBrand({ compact = false, className = "", onDark = false }: InstituteBrandProps) {
  const subtitleColor = onDark ? "text-indigo-200" : "text-indigo-600";
  const nameColor = onDark
    ? "text-white"
    : compact
      ? "text-[var(--foreground)]"
      : "text-blue-950";

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 ${className}`}>
      <Image
        src="/images/Sri-Sai-logo.png"
        alt="Sri Sai Educational Institutions logo"
        width={compact ? 40 : 56}
        height={compact ? 40 : 56}
        className={`${
          compact
            ? "h-9 w-auto shrink-0 object-contain sm:h-10"
            : "h-10 w-auto shrink-0 object-contain sm:h-14"
        }${onDark ? " rounded-md bg-white/95 p-0.5 shadow-sm" : ""}`}
        priority
      />
      <div className="min-w-0 leading-tight">
        <p
          className={`${
            compact
              ? "text-[9px] font-semibold uppercase tracking-[0.15em] sm:text-[10px]"
              : "text-[11px] font-semibold uppercase tracking-[0.2em] sm:text-xs"
          } ${subtitleColor}`}
        >
          Premier Educational Institute
        </p>
        <p
          className={`${
            compact ? "text-[11px] font-bold sm:text-xs" : "text-base font-bold sm:text-2xl"
          } ${nameColor}`}
        >
          Jr.KG to INTER
        </p>
      </div>
    </div>
  );
}
