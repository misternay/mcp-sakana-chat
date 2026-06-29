/**
 * Unit tests: guards/auth.ts
 *
 * Tests AuthGuard.authenticate() for:
 * - disabled (empty key) — passes through
 * - missing Authorization header → 401
 * - malformed header → 401
 * - wrong token → 401
 * - correct token → passes
 * - timing safety: prefix/suffix attacks rejected
 */

import { describe, it, expect } from "vitest";
import { AuthGuard, AuthError } from "../../src/guards/auth.js";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";

function fakeReq(headers: Record<string, string> = {}): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  for (const [k, v] of Object.entries(headers)) {
    req.headers[k.toLowerCase()] = v;
  }
  return req;
}

describe("AuthGuard", () => {
  describe("isDisabled", () => {
    it("returns true for empty string", () => {
      expect(new AuthGuard("").isDisabled).toBe(true);
    });

    it("returns false when key is set", () => {
      expect(new AuthGuard("abc123").isDisabled).toBe(false);
    });
  });

  describe("keyLength", () => {
    it("returns 0 when disabled", () => {
      expect(new AuthGuard("").keyLength).toBe(0);
    });

    it("returns correct byte length", () => {
      expect(new AuthGuard("abc123").keyLength).toBe(6);
    });
  });

  describe("authenticate", () => {
    it("passes through when auth is disabled", () => {
      const guard = new AuthGuard("");
      expect(() => guard.authenticate(fakeReq())).not.toThrow();
    });

    it("throws AuthError when Authorization header is missing", () => {
      const guard = new AuthGuard("secret");
      expect(() => guard.authenticate(fakeReq())).toThrow(AuthError);
    });

    it("throws when header is not Bearer format", () => {
      const guard = new AuthGuard("secret");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "Basic dGVzdDp0ZXN0" }))
      ).toThrow(AuthError);
    });

    it("throws when token is wrong", () => {
      const guard = new AuthGuard("correct-token");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "Bearer wrong-token" }))
      ).toThrow(AuthError);
    });

    it("passes when Bearer token matches", () => {
      const guard = new AuthGuard("my-secret-key");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "Bearer my-secret-key" }))
      ).not.toThrow();
    });

    it("is case-insensitive for Bearer prefix", () => {
      const guard = new AuthGuard("key");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "bearer key" }))
      ).not.toThrow();
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "BEARER key" }))
      ).not.toThrow();
    });

    it("is case-sensitive for the token value", () => {
      const guard = new AuthGuard("SecretKey");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "Bearer secretkey" }))
      ).toThrow(AuthError);
    });

    it("rejects token that is a prefix of the real key", () => {
      const guard = new AuthGuard("long-secret-key");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "Bearer long-secret" }))
      ).toThrow(AuthError);
    });

    it("rejects token that contains the real key as prefix", () => {
      const guard = new AuthGuard("secret");
      expect(() =>
        guard.authenticate(fakeReq({ authorization: "Bearer secret-extra" }))
      ).toThrow(AuthError);
    });
  });

  describe("AuthError", () => {
    it("is an instance of Error", () => {
      expect(new AuthError("test")).toBeInstanceOf(Error);
    });

    it("has name AuthError", () => {
      expect(new AuthError("test").name).toBe("AuthError");
    });
  });
});