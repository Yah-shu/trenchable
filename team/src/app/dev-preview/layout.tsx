import { notFound } from "next/navigation";
import { PREVIEW_ADMIN } from "./pages/fixtures";
import { PreviewShell } from "./pages/preview-shell";

/** Dev-only UI previews with sample data. Never served in production. */
export default function DevPreviewLayout({ children }: LayoutProps<"/dev-preview">) {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewShell profile={PREVIEW_ADMIN}>{children}</PreviewShell>;
}
