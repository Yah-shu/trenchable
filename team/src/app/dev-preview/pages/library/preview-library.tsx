"use client";

import { useState } from "react";
import { Library, type LibraryView } from "@/components/library/library";
import { previewData } from "../../studio/fixtures";
import { PREVIEW_ADMIN } from "../fixtures";

/** The Library on fixtures: media comes through the preview shell's fetch stub, elements from the Studio fixtures. */
export function PreviewLibrary({ initialView }: { initialView: LibraryView }) {
  const [data] = useState(previewData);
  return <Library profile={PREVIEW_ADMIN} initialView={initialView} elementsData={data} />;
}
