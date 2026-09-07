import { z } from 'zod';
import type { Repository } from '../db/index.ts';
import type { RuntimeEnv } from './runtime.ts';
import { InputError } from './safety.ts';

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, x => String.fromCharCode(x)).join(''));
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function cipherKey(env: RuntimeEnv) {
  if (!/^[a-f\d]{64}$/i.test(env.CREDENTIAL_ENCRYPTION_KEY || '')) throw new InputError('Private credential storage is not configured on this server.');
  return crypto.subtle.importKey('raw', Uint8Array.from(env.CREDENTIAL_ENCRYPTION_KEY!.match(/../g)!, x => parseInt(x, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealKey(env: RuntimeEnv, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('CompanyLens:AI:v1') }, await cipherKey(env), encoder.encode(value));
  return { iv: b64(iv), data: b64(new Uint8Array(data)) };
}
export async function openKey(env: RuntimeEnv, sealed: { iv: string; data: string }) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv), additionalData: encoder.encode('CompanyLens:AI:v1') }, await cipherKey(env), bytes(sealed.data)));
}
export async function aiStatus(repo: Repository, env: RuntimeEnv) {
  const raw = await repo.getSetting('aiCredentials'), saved = raw ? JSON.parse(raw) : null;
  const prefs = JSON.parse(await repo.getSetting('aiPreferences') || '{}');
  return { configured: !!env.OPENAI_API_KEY || !!saved, origin: env.OPENAI_API_KEY ? 'environment' : saved ? 'private-settings' : 'none', last4: env.OPENAI_API_KEY ? env.OPENAI_API_KEY.slice(-4) : saved?.last4 ?? null,
    model: env.OPENAI_MODEL || 'gpt-4o-mini', embeddingModel: env.EMBEDDING_MODEL || 'text-embedding-3-small', validatedAt: saved?.validatedAt ?? null,
    autoEnrich: prefs.autoEnrich === true, dailyLimit: prefs.dailyLimit ?? 30, secureStorage: !!env.CREDENTIAL_ENCRYPTION_KEY };
}
export async function modelEnvironment(repo: Repository, env: RuntimeEnv): Promise<RuntimeEnv> {
  if (env.OPENAI_API_KEY) return env;
  const raw = await repo.getSetting('aiCredentials');
  return raw ? { ...env, OPENAI_API_KEY: await openKey(env, JSON.parse(raw)) } : env;
}
export async function saveAiSettings(repo: Repository, env: RuntimeEnv, input: unknown, fetcher: typeof fetch = fetch) {
  const data = z.object({ apiKey: z.string().trim().min(20).max(500).optional(), autoEnrich: z.boolean(), dailyLimit: z.number().int().min(1).max(300) }).parse(input);
  if (data.apiKey) {
    const sealed = await sealKey(env, data.apiKey);
    const response = await fetcher(`https://api.openai.com/v1/models/${encodeURIComponent(env.OPENAI_MODEL || 'gpt-4o-mini')}`, { headers: { authorization: `Bearer ${data.apiKey}` }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    await response.body?.cancel();
    if (!response.ok) throw new InputError(`Key validation returned HTTP ${response.status}. Check the key and model access; the previous key has been preserved.`);
    await repo.setSetting('aiCredentials', JSON.stringify({ ...sealed, last4: data.apiKey.slice(-4), validatedAt: new Date().toISOString() }));
  }
  await repo.setSetting('aiPreferences', JSON.stringify({ autoEnrich: data.autoEnrich, dailyLimit: data.dailyLimit }));
  return aiStatus(repo, env);
}
// Reserve attempts before calling a paid provider, including failed calls. The maintenance lease serializes this budget.
export async function reserveAiAttempt(repo: Repository, limit: number): Promise<boolean> {
  const date = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(await repo.getSetting('aiDailyUsage') || '{}');
  const used = current.date === date ? Number(current.used) || 0 : 0;
  if (used >= limit) return false;
  await repo.setSetting('aiDailyUsage', JSON.stringify({ date, used: used + 1 })); return true;
}
