import { Nav } from "@/components/nav";
import { requireSessionProfile } from "@/lib/auth";

/**
 * The signed-in shell: the lane bar, then the page at full width. The Studio page lays itself out
 * edge to edge; Library and the admin pages wrap themselves in a max-width container (PageContainer).
 */
export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const profile = await requireSessionProfile();
  return (
    <div className="flex min-h-screen flex-col">
      <Nav profile={profile} />
      <main className="flex w-full min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
