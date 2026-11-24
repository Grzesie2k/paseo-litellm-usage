import { z } from "zod";
import {
  hashAccountKey,
  toneFromUsedPct,
  unavailable,
  windowFromUsedPct,
  type UsageAccount,
  type UsageReport,
} from "@getpaseo/plugin/server/usage";
import type { Input } from "../shared/input.js";
import { authPath, readCandidates, readKey } from "./config.js";

const responseSchema = z.object({
  user_info: z.object({
    user_email: z.string().nullable().optional(),
    user_alias: z.string().nullable().optional(),
    spend: z.number().finite(),
    max_budget: z.number().finite().nullable(),
    budget_duration: z.string().nullable().optional(),
    budget_reset_at: z.string().nullable().optional(),
  }),
});

function userInfo(baseUrl: string, key: string, fetchApi: typeof fetch): Promise<Response> {
  return fetchApi(`${baseUrl}/user/info`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
}

async function probeAccount(
  baseUrl: string,
  key: string,
  fetchApi: typeof fetch,
): Promise<string | null | undefined> {
  try {
    const response = await userInfo(baseUrl, key, fetchApi);
    if (!response.ok) return undefined;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return undefined;
    const { user_email, user_alias } = parsed.data.user_info;
    return user_email || user_alias || null;
  } catch {
    return undefined;
  }
}

export async function discover(
  path = authPath(),
  fetchApi: typeof fetch = fetch,
): Promise<UsageAccount[]> {
  const accounts = await Promise.all(
    (await readCandidates()).map(async (candidate): Promise<UsageAccount | null> => {
      const key = await readKey(path, candidate.provider);
      if (!key) return null;
      const identity = await probeAccount(candidate.baseUrl, key, fetchApi);
      if (identity === undefined) return null;
      return {
        key: hashAccountKey(`${path}:${candidate.provider}`),
        label: identity ? `${candidate.name} (${identity})` : candidate.name,
        harness: "OpenCode",
        input: { provider: candidate.provider, authPath: path, baseUrl: candidate.baseUrl },
      };
    }),
  );
  return accounts.filter((account): account is UsageAccount => account !== null);
}

export async function fetchUsage(
  input: Input,
  fetchApi: typeof fetch = fetch,
): Promise<UsageReport> {
  const key = await readKey(input.authPath, input.provider);
  if (!key) throw new Error(`Login for "${input.provider}" no longer exists`);
  const response = await userInfo(input.baseUrl, key, fetchApi);
  if (response.status === 401 || response.status === 403)
    return unavailable({ kind: "rejected", status: response.status, refreshedBy: "opencode" });
  if (!response.ok) throw new Error(`LiteLLM usage API returned ${response.status}`);

  const { spend, max_budget, budget_duration, budget_reset_at } = responseSchema.parse(
    await response.json(),
  ).user_info;
  const limit = max_budget && max_budget > 0 ? max_budget : null;
  const pct = limit === null ? null : (spend / limit) * 100;
  const days = budget_duration?.match(/^(\d+)d$/)?.[1];

  return {
    status: "available",
    windows:
      pct === null
        ? []
        : [
            windowFromUsedPct({
              id: "budget",
              label: days ? `${days}-day budget` : "Budget",
              shortLabel: days ? `${days}d` : "",
              utilizationPct: Math.min(100, pct),
              resetsAt: budget_reset_at ?? null,
              tone: toneFromUsedPct(pct),
            }),
          ],
    balances: [
      {
        id: "budget_usd",
        label: "Budget",
        used: spend,
        remaining: limit === null ? null : Math.max(0, limit - spend),
        limit,
        unit: "usd",
        tone: toneFromUsedPct(pct ?? 0),
      },
    ],
    details: [],
  };
}
