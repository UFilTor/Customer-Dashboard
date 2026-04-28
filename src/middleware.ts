import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that must remain accessible to anonymous users.
const PUBLIC_PATHS = [
  "/auth/signin",
  "/api/auth", // NextAuth's own endpoints
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Local-dev bypass: set DASHBOARD_AUTH_BYPASS=true in .env.local when you
// don't have HubSpot OAuth credentials wired up. Has no effect in production
// builds — `process.env.NODE_ENV` is "production" on Vercel.
const DEV_BYPASS =
  process.env.NODE_ENV !== "production" && process.env.DASHBOARD_AUTH_BYPASS === "true";

export async function middleware(req: NextRequest) {
  if (DEV_BYPASS) return NextResponse.next();
  if (isPublic(req.nextUrl.pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  // API routes get a JSON 401 so the client can react cleanly.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signinUrl = new URL("/auth/signin", req.url);
  signinUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(signinUrl);
}

export const config = {
  // Skip Next.js internals and static assets — match everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
