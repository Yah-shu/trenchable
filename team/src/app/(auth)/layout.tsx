export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">{children}</main>;
}
