import { LoginForm } from "@/components/auth/login-form";

export default async function ZhLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main className="auth-page"><LoginForm locale="zh" next={next} /></main>;
}
