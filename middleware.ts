import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

const PUBLIC_PREFIXES = ["/login", "/zh/login", "/invite", "/auth", "/api/ingest"];

export async function middleware(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

  if (!data.user && !isPublic) {
    const isZh = path.startsWith("/zh");
    const url = request.nextUrl.clone();
    url.pathname = isZh ? "/zh/login" : "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
