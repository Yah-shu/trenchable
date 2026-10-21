import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "../auth-card";
import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <AuthCard title="Choose your password">
      <SetPasswordForm forced={Boolean(user.app_metadata?.must_change_password)} />
    </AuthCard>
  );
}
