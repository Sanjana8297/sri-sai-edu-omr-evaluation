import { isLoginIdTaken, normalizeEmail, type AccountIdentifiers } from "@/lib/user-login-id";

/** @deprecated Use isLoginIdTaken with { email, username: null } */
export async function isEmailTaken(email: string): Promise<boolean> {
  return isLoginIdTaken({ email: normalizeEmail(email), username: null });
}

export { isLoginIdTaken, type AccountIdentifiers };
