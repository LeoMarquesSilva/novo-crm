import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeNextPath(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/crm";
}

function redirectToLogin(request: NextRequest, reason?: string) {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  if (reason) {
    login.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(login);
}

function isAdminPath(pathname: string) {
  return pathname === "/crm/admin" || pathname.startsWith("/crm/admin/");
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (pathname.startsWith("/crm")) {
      return redirectToLogin(request, "missing_supabase_env");
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname === "/login" && user) {
    const safeNext = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(safeNext, request.url));
  }

  if (pathname.startsWith("/crm") && !user) {
    return redirectToLogin(request);
  }

  if (isAdminPath(pathname) && user) {
    const { data: profile } = await supabase
      .from("app_users")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/crm", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/crm", "/crm/:path*", "/login"],
};
