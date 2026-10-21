import { Library, type LibraryView } from "@/components/library/library";
import { PageContainer } from "@/components/ui/misc";
import { requireSessionProfile } from "@/lib/auth";

/** /library shows the media; /library?view=elements the team's saved elements. */
export default async function LibraryPage(props: PageProps<"/library">) {
  const profile = await requireSessionProfile();
  const { view } = await props.searchParams;
  const initialView: LibraryView = view === "elements" ? "elements" : "media";
  return (
    <PageContainer>
      <Library profile={profile} initialView={initialView} />
    </PageContainer>
  );
}
