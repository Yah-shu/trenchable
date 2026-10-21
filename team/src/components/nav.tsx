"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditsPill } from "@/components/credits-pill";
import { UserAvatar } from "@/components/ui/misc";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The lane bar across the top: logo, the section tabs, then credits and the account controls.
 * `hrefMap` re-points the tabs (used by the dev previews); real pages leave it out.
 */
export function Nav({ profile, hrefMap }: { profile: Profile; hrefMap?: Record<string, string> }) {
  const pathname = usePathname();
  const to = (href: string) => hrefMap?.[href] ?? href;
  const links = [
    { href: "/", label: "Studio" },
    { href: "/library", label: "Library" },
    ...(profile.role === "admin"
      ? [
          { href: "/admin", label: "Spend" },
          { href: "/admin/team", label: "Team & API" },
        ]
      : []),
  ].map((l) => ({ ...l, base: l.href, href: to(l.href) }));
  const isActive = (base: string, href: string) =>
    base === "/" || base === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="pl-lanebar flex-wrap !gap-x-3 !gap-y-2 !px-3 sm:flex-nowrap sm:!gap-x-5 sm:!px-6">
      <Link href={to("/")} className="pl-logo shrink-0" aria-label="Trenchable Team home">
        <span className="pl-logo__tile" aria-hidden>
          T
        </span>
        <span className="pl-lanebar__title hidden md:inline">Trenchable Team</span>
      </Link>

      <nav aria-label="Sections" className="order-last min-w-0 basis-full overflow-x-auto sm:order-none sm:basis-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="pl-tabs">
          {links.map((l) => {
            const active = isActive(l.base, l.href);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cn("pl-tab", active && "is-active")}>
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="pl-lanebar__right shrink-0">
        <CreditsPill />
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink" title={profile.display_name}>
          <UserAvatar name={profile.display_name} url={profile.avatar_url} size={28} />
          <span className="hidden max-w-[160px] truncate lg:inline">{profile.display_name}</span>
        </span>
        <Link href="/set-password" title="Change password" aria-label="Change password" className="pl-iconbtn pl-iconbtn--sm">
          <KeyRound />
        </Link>
        <form action="/auth/signout" method="post" className="contents">
          <button type="submit" className="plinth-btn plinth-btn--ghost plinth-btn--xs shrink-0">
            <span className="plinth-btn__face">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
