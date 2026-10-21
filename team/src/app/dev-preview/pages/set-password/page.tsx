import { notFound } from "next/navigation";
import { AuthCard } from "@/app/(auth)/auth-card";
import { SetPasswordForm } from "@/app/(auth)/set-password/set-password-form";

export default function SetPasswordPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <AuthCard title="Choose your password">
        <SetPasswordForm forced />
      </AuthCard>
    </main>
  );
}
