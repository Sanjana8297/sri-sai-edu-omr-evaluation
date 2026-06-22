import Image from "next/image";

type InstituteBrandProps = {
  /** Smaller text for dashboard sidebars and exam headers */
  compact?: boolean;
  className?: string;
};

export function InstituteBrand({ compact = false, className = "" }: InstituteBrandProps) {
  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 ${className}`}>
      <Image
        src="/images/Sri-Sai-logo.png"
        alt="Sri Sai Educational Institutions logo"
        width={compact ? 40 : 56}
        height={compact ? 40 : 56}
        className={
          compact
            ? "h-9 w-auto shrink-0 object-contain sm:h-10"
            : "h-10 w-auto shrink-0 object-contain sm:h-14"
        }
        priority
      />
      <div className="min-w-0 leading-tight">
        <p
          className={
            compact
              ? "text-[9px] font-semibold uppercase tracking-[0.15em] text-indigo-600 sm:text-[10px]"
              : "text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600 sm:text-xs"
          }
        >
          Premier Educational Institute
        </p>
        <p
          className={
            compact
              ? "text-[11px] font-bold text-[var(--foreground)] sm:text-xs"
              : "text-base font-bold text-blue-950 sm:text-2xl"
          }
        >
          Jr.KG to INTER
        </p>
      </div>
    </div>
  );
}
