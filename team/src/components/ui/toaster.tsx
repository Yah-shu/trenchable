"use client";

import { Toaster as Sonner } from "sonner";

/** Toasts in the Plinth look: white card, 2px ink edge, ink text. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      theme="light"
      toastOptions={{
        classNames: {
          toast: "!bg-canvas !text-ink !border-2 !border-ink !rounded-[12px] !font-sans !shadow-[0_4px_0_var(--pl-ink)]",
          title: "!font-semibold",
          description: "!text-mute",
          actionButton: "!bg-coral !text-ink !border-2 !border-ink !rounded-[8px] !font-semibold",
          cancelButton: "!bg-paper !text-ink !rounded-[8px]",
          success: "[&_[data-icon]]:!text-ok",
          error: "[&_[data-icon]]:!text-bad",
          warning: "[&_[data-icon]]:!text-warn",
          info: "[&_[data-icon]]:!text-info",
        },
      }}
    />
  );
}
