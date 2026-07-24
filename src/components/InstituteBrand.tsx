import { INSTITUTE_LOGO_SRC } from "@/lib/institute-brand";

type InstituteBrandProps = {
  /** Smaller text for dashboard sidebars and exam headers */
  compact?: boolean;
  className?: string;
  /** Render light text + a light logo chip for use on a dark/brand-blue surface */
  onDark?: boolean;
};

/**
 * Institute lockup: circular seal + SriSai wordmark
 * (Educational Institutions / tagline / High School | Junior College | Academy).
 */
export function InstituteBrand({ compact = false, className = "", onDark = false }: InstituteBrandProps) {
  const nameColor = onDark ? "text-white" : "text-[#1a4fb8]";
  const institutionsColor = onDark ? "text-red-300" : "text-[#e31c23]";
  const taglineColor = onDark ? "text-indigo-100" : "text-neutral-800";
  const levelsColor = onDark ? "text-indigo-100" : "text-neutral-900";
  const ruleColor = onDark ? "bg-sky-300/80" : "bg-[#1a4fb8]/60";
  const pipeColor = onDark ? "text-red-300" : "text-[#e31c23]";

  // Explicit sizes so the seal stays visible and roughly matches the wordmark stack height.
  const logoPx = compact ? 64 : 96;

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain img avoids fill/aspect collapse */}
      <img
        src={INSTITUTE_LOGO_SRC}
        alt="Sri Sai Educational Institutions logo"
        width={logoPx}
        height={logoPx}
        className={`${
          compact
            ? "h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
            : "h-[4.75rem] w-[4.75rem] shrink-0 object-contain sm:h-24 sm:w-24"
        }`}
      />
      <div className="flex min-w-0 flex-col justify-center leading-none">
        <p
          className={`${
            compact
              ? "text-sm font-extrabold tracking-tight sm:text-base"
              : "text-xl font-extrabold tracking-tight sm:text-2xl"
          } ${nameColor}`}
        >
          SriSai
        </p>
        <p
          className={`${
            compact
              ? "mt-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] sm:text-[9px]"
              : "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-[11px]"
          } ${institutionsColor}`}
        >
          Educational Institutions
        </p>
        {!compact ? (
          <div className={`mt-1.5 flex items-center gap-2 ${taglineColor}`}>
            <span className={`h-px w-4 shrink-0 sm:w-6 ${ruleColor}`} aria-hidden />
            <p className="truncate text-[10px] italic leading-none sm:text-xs">
              Redefining Education - Inspiring Excellence
            </p>
            <span className={`h-px w-4 shrink-0 sm:w-6 ${ruleColor}`} aria-hidden />
          </div>
        ) : null}
        <p
          className={`${
            compact
              ? "mt-1 text-[8px] font-medium sm:text-[9px]"
              : "mt-1.5 text-[10px] font-medium sm:text-xs"
          } ${levelsColor}`}
        >
          High School <span className={pipeColor}>|</span> Junior College{" "}
          <span className={pipeColor}>|</span> Academy
        </p>
      </div>
    </div>
  );
}
