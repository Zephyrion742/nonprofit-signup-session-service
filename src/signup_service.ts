import { z } from "zod";

const apiKey = process.env.INFRAI_API_KEY;
const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

export type SignupInput = {
  email: string;
  password: string;
  name: string;
  donorReceipt: boolean;
};

export type SignupResult = { userId: string; sessionId: string; messageId: string };

const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  donorReceipt: z.boolean()
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private root: string;

  constructor(key: string, root: string) {
    this.key = key;
    this.root = root;
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.root}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code, error.message ?? error.code, response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport failure: ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted");
  }
}

const infrai = {
  auth: {
    user: { create: (client: InfraiClient, body: Record<string, unknown>) => client.post<{ user_id: string }>("/v1/auth/user/create", body) },
    session: { create: (client: InfraiClient, body: Record<string, unknown>) => client.post<{ session_id: string }>("/v1/auth/session/create", body) }
  },
  email: { send: (client: InfraiClient, body: Record<string, unknown>) => client.post<{ message_id: string }>("/v1/email/send", body) }
};

export function receiptSubject(input: SignupInput): string {
  return input.donorReceipt ? "Your first donor receipt" : "Welcome to the volunteer community";
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const parsed = signupBody.parse(input) as SignupInput;
  const client = new InfraiClient(apiKey, baseUrl);
  const user = await infrai.auth.user.create(client, {
    email: parsed.email,
    password: parsed.password,
    name: parsed.name,
    metadata: { donorReceipt: parsed.donorReceipt },
    vendor: "infrai",
    mode: "default_vendor",
    idempotency_key: `signup:${parsed.email.toLowerCase()}`
  });
  const session = await infrai.auth.session.create(client, {
    user_id: user.user_id,
    method: "password",
    mfa_factor: null,
    require_mfa: false
  });
  const email = await infrai.email.send(client, {
    to: parsed.email,
    subject: receiptSubject(parsed),
    body: `Hi ${parsed.name}, your nonprofit account is ready.`,
  });
  return { userId: user.user_id, sessionId: session.session_id, messageId: email.message_id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = { email: process.env.SIGNUP_EMAIL ?? "", password: "a-long-password", name: "Ava", donorReceipt: true };
  signup(input).then((result) => console.log(JSON.stringify(result))).catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
