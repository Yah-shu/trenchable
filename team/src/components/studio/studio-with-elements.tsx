"use client";

import { useMemo } from "react";
import { elementsSlotFor } from "./elements-panel";
import { Studio, type StudioProps } from "./studio";

/**
 * The Studio with the team's saved elements in the composer's + popover. The slot is a render
 * function, so it's built here on the client (a server page can't pass functions down).
 */
export function StudioWithElements(props: Omit<StudioProps, "elementsSlot">) {
  const { profile } = props;
  const elementsSlot = useMemo(() => elementsSlotFor(profile), [profile]);
  return <Studio {...props} elementsSlot={elementsSlot} />;
}
