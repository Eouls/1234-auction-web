import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { syncDiscordProfileFromAuthUser } from "@/lib/auth/onboarding";
import { prisma } from "@/lib/prisma";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const cookieResponse = NextResponse.next();

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  const {
    data: { user: authUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !authUser) {
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    await syncDiscordProfileFromAuthUser(authUser);
  }

  const redirectPath = existingUser ? "/home" : "/onboarding";
  const redirectResponse = NextResponse.redirect(new URL(redirectPath, origin));

  cookieResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}
