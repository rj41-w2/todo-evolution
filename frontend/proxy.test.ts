import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { NextResponse } from "next/server";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      next: vi.fn(() => ({ type: "next" })),
      redirect: vi.fn((url: URL) => ({ type: "redirect", url: url.toString() })),
    },
  };
});

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
  url = "https://example.com",
): NextRequest {
  return {
    nextUrl: { pathname },
    url,
    cookies: {
      get: (name: string) => (
        cookies[name]
          ? { name, value: cookies[name] }
          : undefined
      ),
    },
  } as unknown as NextRequest;
}

describe("proxy auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows protected requests with the secure Better Auth session cookie", () => {
    const request = makeRequest("/tasks", {
      "__Secure-better-auth.session_token": "secure-session",
    });

    const response = proxy(request);

    expect(response).toEqual({ type: "next" });
    expect(NextResponse.next).toHaveBeenCalledOnce();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("allows protected requests with the local-development session cookie", () => {
    const request = makeRequest("/tasks", {
      "better-auth.session_token": "local-session",
    }, "http://localhost:3000");

    const response = proxy(request);

    expect(response).toEqual({ type: "next" });
    expect(NextResponse.next).toHaveBeenCalledOnce();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated protected requests to login", () => {
    const request = makeRequest("/tasks");

    const response = proxy(request);

    expect(response).toEqual({
      type: "redirect",
      url: "https://example.com/login",
    });
    expect(NextResponse.redirect).toHaveBeenCalledOnce();
    expect(NextResponse.next).not.toHaveBeenCalled();
  });
});
