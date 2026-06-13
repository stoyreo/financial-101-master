"use client";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// ── Minimal WebAuthn helpers (no external deps) ──────────────────────────────

function browserSupportsWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** base64url → Uint8Array */
function b64ToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Uint8Array → base64url */
function bytesToB64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Convert Supabase JSON options → native PublicKeyCredentialCreationOptions */
function toCreationOptions(opts: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const o = opts as any;
  return {
    ...o,
    challenge: b64ToBytes(o.challenge),
    user: { ...o.user, id: b64ToBytes(o.user.id) },
    excludeCredentials: (o.excludeCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64ToBytes(c.id),
    })),
  };
}

/** Convert Supabase JSON options → native PublicKeyCredentialRequestOptions */
function toRequestOptions(opts: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const o = opts as any;
  return {
    ...o,
    challenge: b64ToBytes(o.challenge),
    allowCredentials: (o.allowCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64ToBytes(c.id),
    })),
  };
}

/** Serialize a registration credential to the JSON format Supabase expects */
function serializeRegistration(cred: PublicKeyCredential): Record<string, unknown> {
  const resp = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bytesToB64(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64(resp.clientDataJSON),
      attestationObject: bytesToB64(resp.attestationObject),
      transports: resp.getTransports?.() ?? [],
    },
  };
}

/** Serialize an authentication credential to the JSON format Supabase expects */
function serializeAuthentication(cred: PublicKeyCredential): Record<string, unknown> {
  const resp = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bytesToB64(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64(resp.clientDataJSON),
      authenticatorData: bytesToB64(resp.authenticatorData),
      signature: bytesToB64(resp.signature),
      userHandle: resp.userHandle ? bytesToB64(resp.userHandle) : null,
    },
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePasskey() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== "undefined" && browserSupportsWebAuthn();

  // Register Touch ID — user must be already signed in
  async function register(): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();

      const { data: startData, error: startErr } =
        await supabase.auth.passkey.startRegistration();
      if (startErr || !startData)
        throw startErr ?? new Error("Failed to start registration");

      const pkOptions = toCreationOptions(
        startData.options as unknown as Record<string, unknown>
      );
      const credential = await navigator.credentials.create({ publicKey: pkOptions });
      if (!credential) throw new Error("No credential returned");

      const serialized = serializeRegistration(credential as PublicKeyCredential);

      const { error: verifyErr } = await supabase.auth.passkey.verifyRegistration({
        challengeId: startData.challenge_id,
        credential: serialized as any,
      });
      if (verifyErr) throw verifyErr;

      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Touch ID registration failed");
      return false;
    } finally {
      setLoading(false);
    }
  }

  // Sign in with Touch ID — no password needed
  async function login(): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();

      const { data: startData, error: startErr } =
        await supabase.auth.passkey.startAuthentication();
      if (startErr || !startData)
        throw startErr ?? new Error("Failed to start authentication");

      const pkOptions = toRequestOptions(
        startData.options as unknown as Record<string, unknown>
      );
      const credential = await navigator.credentials.get({ publicKey: pkOptions });
      if (!credential) throw new Error("No credential returned");

      const serialized = serializeAuthentication(credential as PublicKeyCredential);

      const { error: verifyErr } = await supabase.auth.passkey.verifyAuthentication({
        challengeId: startData.challenge_id,
        credential: serialized as any,
      });
      if (verifyErr) throw verifyErr;

      return true;
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : "Touch ID sign-in failed";
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { register, login, loading, error, isSupported };
}
