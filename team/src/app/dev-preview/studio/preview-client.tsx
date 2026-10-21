"use client";

import { useState } from "react";
import { elementsSlotFor } from "@/components/studio/elements-panel";
import { Studio } from "@/components/studio/studio";
import type { StudioData } from "@/components/studio/studio-data";
import { browserStorage, saveDraft } from "@/lib/client/draft";
import { previewData, previewDraft, previewDurations, previewProfile, previewTeam, previewVoices } from "./fixtures";

/** The Studio on fixtures. The dev-preview layout supplies the real lane bar. */
export function PreviewStudio({ viewer, menu, empty, composer, elements }: { viewer?: boolean; menu?: boolean; empty?: boolean; composer?: boolean; elements?: boolean }) {
  const [elementsSlot] = useState(() => elementsSlotFor(previewProfile));
  const [data] = useState<StudioData>(() => {
    // Seed the composer's saved draft before the Studio reads it (it renders after hydration).
    if (composer) saveDraft(browserStorage(), previewDraft());
    const d = previewData();
    return empty ? { ...d, listGenerations: async () => ({ data: [], page: 1, limit: 24, total: 0, has_more: false }) } : d;
  });
  return (
    <Studio
      profile={previewProfile}
      team={previewTeam}
      typicalDurations={previewDurations}
      retentionDays={7}
      voices={previewVoices}
      data={data}
      elementsSlot={elementsSlot}
      preview={{ viewer, menu, elements }}
    />
  );
}
