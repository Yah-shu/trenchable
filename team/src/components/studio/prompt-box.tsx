"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { promptSegments, type RefCounts } from "@/lib/client/mentions";
import { cn } from "@/lib/utils";

export type PromptBoxHandle = {
  focus: () => void;
  /** Where the caret was last (kept while a button has focus). */
  caret: () => number | null;
  setCaret: (at: number) => void;
};

const MAX_HEIGHT = 200;
// The overlay and the textarea share every metric, so the chips sit exactly behind their tokens.
const TEXT = "block w-full min-h-[56px] resize-none border-0 bg-transparent px-1 py-1.5 font-sans text-[14.5px] leading-[1.5] whitespace-pre-wrap break-words outline-none [scrollbar-gutter:stable]";

/**
 * The prompt textarea. It grows with its text (to a limit, then scrolls), and when mentions are
 * on, the same characters are drawn behind it with each `@image1` token on a chip; a token whose
 * file isn't attached gets the "missing" chip. The text itself is the textarea's own and is sent
 * unchanged.
 */
export const PromptBox = forwardRef<
  PromptBoxHandle,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    counts: RefCounts | null;
    maxLength?: number;
    onPasteFiles?: (files: File[]) => void;
    label: string;
  }
>(function PromptBox({ value, onChange, placeholder, counts, maxLength, onPasteFiles, label }, ref) {
  const box = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => box.current?.focus(),
    caret: () => caret.current,
    setCaret: (at) => {
      caret.current = at;
      requestAnimationFrame(() => {
        box.current?.focus();
        box.current?.setSelectionRange(at, at);
      });
    },
  }));

  // Grow with the text, up to MAX_HEIGHT, then scroll.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`;
    if (hl.current) hl.current.scrollTop = el.scrollTop;
    // The placeholder counts towards the height too, so a new model's placeholder re-measures.
  }, [value, placeholder]);

  const segments = useMemo(() => (counts ? promptSegments(value, counts) : []), [value, counts]);
  const tokens = segments.filter((s) => s.ref);
  const hasTokens = tokens.length > 0;
  const remember = () => {
    caret.current = box.current?.selectionStart ?? null;
  };

  return (
    <div className="relative min-w-0 flex-1">
      {hasTokens ? (
        <div ref={hl} aria-hidden className={cn(TEXT, "pointer-events-none absolute inset-0 select-none overflow-hidden text-transparent")}>
          {segments.map((s, i) =>
            s.ref ? (
              <span key={i} className={cn("pl-chip", !s.ref.attached && "is-missing")}>
                {s.text}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
          {"​"}
        </div>
      ) : null}
      <textarea
        ref={box}
        aria-label={label}
        rows={2}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        title={
          hasTokens
            ? tokens.map((t) => `${t.text} = ${t.ref!.kind} ${t.ref!.n}${t.ref!.attached ? "" : " (not attached)"}`).join(" · ")
            : undefined
        }
        className={cn(TEXT, "relative z-[1] max-h-[200px] overflow-y-auto placeholder:text-faint")}
        onChange={(e) => {
          onChange(e.target.value);
          caret.current = e.target.selectionStart;
        }}
        onScroll={(e) => {
          if (hl.current) hl.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyUp={remember}
        onClick={remember}
        onBlur={remember}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (!files.length || !onPasteFiles) return;
          e.preventDefault();
          onPasteFiles(files);
        }}
      />
    </div>
  );
});
