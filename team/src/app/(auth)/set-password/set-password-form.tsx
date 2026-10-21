"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { changePassword } from "./actions";

export function SetPasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError("");
    const result = await changePassword(password);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success("Password saved");
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="space-y-5">
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-mute">
        {forced ? "Welcome! Choose your own password to replace the temporary one." : "Choose a new password."}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="pw">New password</Label>
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw2">Confirm password</Label>
        <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error ? <p role="alert" className="rounded-[8px] border border-bad bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      <Button type="submit" variant="primary" size="lg" className="!mt-6 w-full" disabled={busy}>
        {busy ? "Saving…" : "Save password"}
      </Button>
    </form>
      <div className="text-center">
        {forced ? (
          <form action="/auth/signout" method="post" className="contents">
            <button className="text-xs font-semibold text-ink underline decoration-ink/35 decoration-2 underline-offset-4 hover:decoration-ink">Sign out</button>
          </form>
        ) : (
          <Link href="/" className="text-xs font-semibold text-ink underline decoration-ink/35 decoration-2 underline-offset-4 hover:decoration-ink">
            Back to the studio
          </Link>
        )}
      </div>
    </div>
  );
}
