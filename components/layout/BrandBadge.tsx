import Link from "next/link";

/**
 * Compact brand badge matching the login page's identity lockup.
 * Icon square + two-line text: XOXO / Meridian.
 * Uses the project's sage-green accent for visual consistency.
 */
export function BrandBadge({ href = "/home", accentClass }: { href?: string; accentClass?: string }) {
  const badge = (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-sm font-bold text-white ${accentClass ?? "bg-[#7da878]"}`}>
        🌿
      </div>
      <div>
        <p className="text-xs font-semibold leading-tight text-black">XOXO</p>
        <p className="text-[10px] font-medium leading-tight text-black/40">Meridian</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-opacity duration-200 hover:opacity-80">
        {badge}
      </Link>
    );
  }

  return badge;
}
