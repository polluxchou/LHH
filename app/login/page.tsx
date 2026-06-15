import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main className="auth-page"><LoginForm locale="en" next={next} /></main>;
}
