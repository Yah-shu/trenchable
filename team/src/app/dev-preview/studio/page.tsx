import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PreviewStudio } from "./preview-client";

/**
 * Dev-only: the Studio on sample data, no sign-in and no network.
 *   /dev-preview/studio            the feed and the composer
 *   /dev-preview/studio?viewer=1   with the viewer open
 *   /dev-preview/studio?menu=1     with the model menu open
 *   /dev-preview/studio?empty=1    the empty state
 *   /dev-preview/studio?composer=1 a draft with references and @mentions in the composer
 *   /dev-preview/studio?elements=1 with the + popover open on the team's saved elements
 */
export default async function StudioPreviewPage(props: PageProps<"/dev-preview/studio">) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await props.searchParams;
  const on = (k: string) => sp[k] === "1";
  return (
    <Suspense>
      <PreviewStudio viewer={on("viewer")} menu={on("menu")} empty={on("empty")} composer={on("composer")} elements={on("elements")} />
    </Suspense>
  );
}
