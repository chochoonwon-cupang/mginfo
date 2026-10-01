import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export {
  DEFAULT_SITE_PASSWORD,
  DEFAULT_SITE_USERNAME,
  canConfirmSiteAccount,
  checkMasterLogin,
  checkSiteLogin,
  masterLoginPassword,
  masterLoginUsername,
  siteAccountFrom,
  validateSiteAccount,
  validateSitePassword,
  validateSiteUsername,
} from "./site-account";
export { checkMasterLogin as checkAdminCredentials } from "./site-account";

const COOKIE = "infocs_admin";
const MASTER_COOKIE = "infocs_master";

function secretKey() {
  const secret = process.env.AUTH_SECRET || "infocs-magazine-dev-secret";
  return new TextEncoder().encode(secret);
}

export async function createAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function createMasterToken(): Promise<string> {
  return new SignJWT({ role: "master" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

const ADMIN_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export function applyAdminCookie(
  res: { cookies: { set: (name: string, value: string, options?: Record<string, unknown>) => unknown } },
  token: string
) {
  res.cookies.set(COOKIE, token, ADMIN_COOKIE_OPTS);
}

export async function setAdminCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, ADMIN_COOKIE_OPTS);
}

export async function setMasterCookie(token: string) {
  const jar = await cookies();
  jar.set(MASTER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(MASTER_COOKIE);
}

export async function clearMasterCookie() {
  const jar = await cookies();
  jar.delete(MASTER_COOKIE);
}

export async function isAdminSession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  return verifyAdminToken(token);
}

export async function isMasterSession(): Promise<boolean> {
  if (!(await isAdminSession())) return false;
  const jar = await cookies();
  const token = jar.get(MASTER_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.role === "master";
  } catch {
    return false;
  }
}

export function checkMasterPassword(password: string): boolean {
  const expected = process.env.MASTER_PASSWORD || "ybijour80";
  return password === expected;
}

export { COOKIE, MASTER_COOKIE };
