import { z } from 'zod';
import { initialCompanies, initialSources, CATALOG_VERSION, COLLECTION_INTERVAL_MS } from './catalog.ts';
import { matchesCompany } from './intelligence.ts';
import { loadSource } from './sources.ts';
import type { CollectedItem } from './sources.ts';
import type { Source } from './types.ts';
import { readLimited } from './safety.ts';

export const SNAPSHOT_RETENTION = 56; // Seven days at eight collections per day.
export const MAX_SNAPSHOT_ITEMS = 2000;
const iso = z.string().datetime();
const collectedItem = z.object({ title: z.string().min(1).max(500), url: z.string().url().max(2000), text: z.string().min(1).max(2400), publishedAt: iso.nullable(), language: z.string().max(10), scope: z.literal('feed-excerpt') });
export const snapshotSchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[0-9]{13}-[a-f0-9]{8}$/), catalogVersion: z.string().max(80), startedAt: iso, finishedAt: iso,
  sources: z.array(z.object({ id: z.string().max(80), status: z.enum(['healthy', 'error']), scanned: z.number().int().min(0).max(150), matched: z.number().int().min(0).max(3000), error: z.string().max(1000).nullable() })).max(250),
  items: z.array(z.object({ companyId: z.string().max(80), sourceId: z.string().max(80), item: collectedItem })).max(MAX_SNAPSHOT_ITEMS),
  truncated: z.boolean(),
});
export type CoverageSnapshot = z.infer<typeof snapshotSchema>;
export const manifestSchema = z.object({ version: z.literal(1), generatedAt: iso, intervalHours: z.literal(3), snapshots: z.array(z.object({ id: z.string().regex(/^[0-9]{13}-[a-f0-9]{8}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), finishedAt: iso })).max(SNAPSHOT_RETENTION) });
export type CoverageManifest = z.infer<typeof manifestSchema>;

// Bound network concurrency, and serialize requests to each publisher host.
export async function collectCatalog(loader = loadSource, sources: Source[] = initialSources): Promise<CoverageSnapshot> {
  const snapshot: CoverageSnapshot = { version: 1, id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, catalogVersion: CATALOG_VERSION, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), sources: [], items: [], truncated: false };
  const hostTails = new Map<string, Promise<void>>(); let cursor = 0;
  const collect = async (source: Source) => {
    const host = new URL(source.url).hostname, before = hostTails.get(host) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); hostTails.set(host, gate);
    await before;
    try {
      let items: CollectedItem[];
      try { items = await loader(source); }
      catch (error) {
        // One retry for transient transport/server failures; never retry access denials.
        if (!/timeout|timed out|fetch failed|HTTP 50[234]/i.test(String(error))) throw error;
        await new Promise(resolve => setTimeout(resolve, 750)); items = await loader(source);
      }
      let matched = 0;
      for (const item of items.slice(0, 150)) for (const company of initialCompanies) {
        if (!matchesCompany(`${item.title}\n${item.text}`, company)) continue;
        matched++;
        if (snapshot.items.length >= MAX_SNAPSHOT_ITEMS) { snapshot.truncated = true; continue; }
        snapshot.items.push({ sourceId: source.id, companyId: company.id, item: { ...item, text: item.text.slice(0, 2400), scope: 'feed-excerpt' } });
      }
      snapshot.sources.push({ id: source.id, status: 'healthy', scanned: Math.min(items.length, 150), matched, error: null });
    } catch (error) {
      snapshot.sources.push({ id: source.id, status: 'error', scanned: 0, matched: 0, error: error instanceof Error ? error.message.slice(0, 1000) : 'Collection failed.' });
    } finally { release(); }
  };
  await Promise.all(Array.from({ length: 4 }, async () => { while (cursor < sources.length) { const source = sources[cursor++]; if (source.enabled) await collect(source); } }));
  snapshot.finishedAt = new Date().toISOString();
  snapshot.sources.sort((a, b) => a.id.localeCompare(b.id));
  snapshot.items.sort((a, b) => (b.item.publishedAt ?? '').localeCompare(a.item.publishedAt ?? ''));
  return snapshotSchema.parse(snapshot);
}
function b64(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let value = '';
  for (let i = 0; i < data.length; i += 8192) value += String.fromCharCode(...data.slice(i, i + 8192));
  return btoa(value);
}
function unb64(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
const envelopeSchema = z.object({ version: z.literal(1), algorithm: z.literal('RSA-OAEP-256+A256GCM'), key: z.string().max(1000), iv: z.string().max(30), ciphertext: z.string().max(8_000_000) });
export async function sealSnapshot(snapshot: CoverageSnapshot, publicKey: JsonWebKey): Promise<string> {
  const recipient = await crypto.subtle.importKey('jwk', publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const compressed = await new Response(new Blob([JSON.stringify(snapshotSchema.parse(snapshot))]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('CompanyLens:coverage:v1') }, key, compressed);
  const wrapped = await crypto.subtle.wrapKey('raw', key, recipient, { name: 'RSA-OAEP' });
  return JSON.stringify({ version: 1, algorithm: 'RSA-OAEP-256+A256GCM', key: b64(wrapped), iv: b64(iv), ciphertext: b64(ciphertext) });
}
export async function openSnapshot(sealed: string, privateKey: JsonWebKey): Promise<CoverageSnapshot> {
  const envelope = envelopeSchema.parse(JSON.parse(sealed));
  const recipient = await crypto.subtle.importKey('jwk', privateKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
  const key = await crypto.subtle.unwrapKey('raw', unb64(envelope.key), recipient, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: new TextEncoder().encode('CompanyLens:coverage:v1') }, key, unb64(envelope.ciphertext));
  const response = new Response(new Blob([plaintext]).stream().pipeThrough(new DecompressionStream('gzip')));
  return snapshotSchema.parse(JSON.parse(await readLimited(response, 12_000_000)));
}
export function nextCollection(after: string): string { return new Date(Date.parse(after) + COLLECTION_INTERVAL_MS).toISOString(); }
