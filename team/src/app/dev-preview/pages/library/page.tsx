import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/misc";
import { PreviewLibrary } from "./preview-library";

/**
 * Library reads /api/media itself; the preview shell answers it with fixtures. Elements come from
 * the Studio fixtures. `?view=elements` opens the Elements tab.
 */
export default async function LibraryPreview(props: PageProps<"/dev-preview/pages/library">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await props.searchParams;
  return (
    <PageContainer>
      <PreviewLibrary initialView={view === "elements" ? "elements" : "media"} />
    </PageContainer>
  );
}
