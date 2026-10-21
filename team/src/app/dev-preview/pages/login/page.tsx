import { notFound } from "next/navigation";
import { AuthCard } from "@/app/(auth)/auth-card";
import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <AuthCard title="Sign in to Trenchable Team" subtitle="Use the email and password your admin gave you.">
        <LoginForm next="/dev-preview" />
      </AuthCard>
    </main>
  );
}
