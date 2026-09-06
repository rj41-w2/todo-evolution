import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/api/auth");
  const isStaticFile = pathname.startsWith("/_next") || pathname.startsWith("/favicon.ico");

  if (!sessionToken && !isAuthPage && !isStaticFile) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionToken && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/tasks|api/users|_next/static|_next/image|favicon.ico).*)",
  ],
};
