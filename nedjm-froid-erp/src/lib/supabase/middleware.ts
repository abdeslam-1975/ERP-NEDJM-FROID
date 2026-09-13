import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CHANGE_PASSWORD_PATH = "/changer-mot-de-passe";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isChangePassword = pathname === CHANGE_PASSWORD_PATH;
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".");

  if (isPublicAsset) {
    return supabaseResponse;
  }

  if (!user && !isLogin) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("sys_users")
      .select("must_reset_password")
      .eq("id", user.id)
      .maybeSingle();

    const mustReset = profile?.must_reset_password === true;

    if (mustReset && !isChangePassword) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = CHANGE_PASSWORD_PATH;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (!mustReset && isChangePassword) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (isLogin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = mustReset ? CHANGE_PASSWORD_PATH : "/";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
