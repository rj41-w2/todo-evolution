import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check if Better Auth session cookie exists
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;
  const { pathname } = request.nextUrl;

  // Exclude auth-related routes, Next.js assets, and static files
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/api/auth");
  const isStaticFile = pathname.startsWith("/_next") || pathname.startsWith("/favicon.ico");

  if (!sessionToken && !isAuthPage && !isStaticFile) {
    // Redirect unauthenticated users to the login page
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionToken && (pathname === "/login" || pathname === "/register")) {
    // Redirect already authenticated users from login/register back to dashboard
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply middleware to all routes except standard API routes and public static folder assets
    "/((?!api/tasks|api/users|_next/static|_next/image|favicon.ico).*)",
  ],
};
