import { mock } from "bun:test";
mock.module("@/lib/auth", () => ({
  getSessionUser: async () => ({ id: "smoke", email: "owner@agencyos.local", displayName: "Agency Owner", role: "OWNER", status: "ACTIVE" }),
  createSession: async () => {},
  destroySession: async () => {},
  getSecretAsync: async () => new Uint8Array(32),
  SESSION_TTL_MS: 1000,
}));
const { GET } = await import("@/app/api/billing/gateway/status/route");
const res = await GET(new Request("http://localhost:3000/api/billing/gateway/status") as any);
console.log(res.status, JSON.stringify(await res.json()));
process.exit(0);
