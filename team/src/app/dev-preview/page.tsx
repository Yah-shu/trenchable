import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/ui/misc";

const PREVIEWS = [
  { href: "/dev-preview/studio", title: "Studio", note: "The generation page" },
  { href: "/dev-preview/studio?elements=1", title: "Studio elements", note: "Saved elements in the composer's + menu" },
  { href: "/dev-preview/pages/library", title: "Library", note: "Shared media with filters" },
  { href: "/dev-preview/pages/library?view=elements", title: "Library elements", note: "Browse, create and edit elements" },
  { href: "/dev-preview/pages/spend", title: "Spend", note: "Admin cost dashboard" },
  { href: "/dev-preview/pages/team", title: "Team & API", note: "Members, bots and keys" },
  { href: "/dev-preview/pages/login", title: "Sign in", note: "Signed-out card" },
  { href: "/dev-preview/pages/set-password", title: "Set password", note: "First sign-in card" },
];

export default function DevPreviewIndex() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PageContainer>
      <PageHeader title="Previews" subtitle="Dev-only pages with sample data. Nothing here talks to a backend." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PREVIEWS.map((p) => (
          <Link key={p.href} href={p.href} className="pl-press">
            <div className="pl-panel p-5">
              <div className="font-display text-lg font-semibold">{p.title}</div>
              <div className="mt-1 text-sm text-mute">{p.note}</div>
              <div className="mt-3 font-mono text-xs text-mute">{p.href}</div>
            </div>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
