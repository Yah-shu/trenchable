/** The raised card the sign-in and password pages sit in. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[400px]">
      <div className="pl-press">
        <div className="pl-panel px-6 pb-7 pt-7 sm:px-8">
          <div className="pl-logo mb-6">
            <span className="pl-logo__tile" aria-hidden>
              T
            </span>
            <span className="pl-lanebar__title">Trenchable Team</span>
          </div>
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-mute">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-mute">AI image, video and voice for your team, on Kie.ai</p>
    </div>
  );
}
