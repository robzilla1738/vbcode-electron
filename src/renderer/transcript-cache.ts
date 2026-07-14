import type { Block, TranscriptState } from "../shared/reducer";
import { estimateJsonUtf8Bytes } from "../shared/json-size";

const DATABASE = "vibe-codr-presentation";
const STORE = "transcripts";
const VERSION = 2;
const MAX_ENTRIES = 20;
const MAX_SERIALIZED_CHARS = 32 * 1024 * 1024;
const MAX_TOTAL_SERIALIZED_CHARS = 96 * 1024 * 1024;

interface CacheRecord {
  key: string;
  savedAt: number;
  signature: string;
  state: string;
  size?: number;
}

function keyFor(cwd: string, sessionId: string): string {
  return `${cwd}\u0000${sessionId}`;
}

export function transcriptCacheKeyBelongsToCwd(key: string, cwd: string): boolean {
  return key.startsWith(`${cwd}\u0000`);
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE)
        ? request.transaction!.objectStore(STORE)
        : request.result.createObjectStore(STORE, { keyPath: "key" });
      if (!store.indexNames.contains("savedAt")) {
        store.createIndex("savedAt", "savedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function blockIdentity(block: Block): string {
  if (block.kind === "user") {
    return `u:${block.origin ?? "user"}:${block.label ?? ""}:${block.text}`;
  }
  if (block.kind === "assistant") return `a:${block.text}`;
  if (block.kind === "thinking") {
    return `r:${block.text}`;
  }
  if (block.kind === "notice") return `n:${block.level}:${block.text}`;
  return JSON.stringify({
    kind: block.kind,
    toolName: block.toolName,
    label: block.label,
    output: block.output,
    isDiff: block.isDiff,
    isMarkdown: block.isMarkdown,
    isSources: block.isSources,
    isError: block.isError,
    done: block.done,
    tail: block.tail,
  });
}

/** Hash every content-bearing field while deliberately excluding presentation
 * state (ids, timestamps, collapse state, and elapsed-time chrome). */
export function transcriptContentSignature(state: TranscriptState): string {
  let hash = 2166136261;
  let chars = 0;
  let items = 0;
  for (const block of state.blocks) {
    const value = blockIdentity(block);
    items += 1;
    chars += value.length;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 10;
    hash = Math.imul(hash, 16777619);
  }
  for (const file of state.changedFiles) {
    const value = JSON.stringify([file.path, file.added, file.removed, file.diff]);
    items += 1;
    chars += value.length;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 10;
    hash = Math.imul(hash, 16777619);
  }
  return `${items}:${chars}:${(hash >>> 0).toString(16)}`;
}

/** Compare a cache with the fields engine history can reconstruct exactly.
 * Event-only notices and file-change presentations are intentionally excluded:
 * the host persists tool calls/results, but not the authoritative file-change
 * event counts/diffs, so hydration can only guess those values. Non-diff tool
 * results remain covered and prevent stale executable output from matching. */
export function transcriptConversationSignature(state: TranscriptState): string {
  return transcriptContentSignature({
    ...state,
    blocks: state.blocks.filter(
      (block) => block.kind !== "notice" && (block.kind !== "tool" || !block.isDiff),
    ),
    changedFiles: [],
  });
}

function isTranscriptState(value: unknown): value is TranscriptState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<TranscriptState>;
  return Array.isArray(state.blocks)
    && state.blocks.every((block) => {
      if (!block || typeof block !== "object") return false;
      const item = block as { kind?: unknown; id?: unknown };
      return typeof item.kind === "string" && Number.isFinite(item.id);
    })
    && Array.isArray(state.changedFiles)
    && Number.isFinite(state.nextId)
    && typeof state.toolByCallId === "object"
    && state.toolByCallId !== null
    && typeof state.suppressCallIds === "object"
    && state.suppressCallIds !== null;
}

function settle(state: TranscriptState): TranscriptState {
  return {
    ...state,
    activeAssistant: -1,
    toolByCallId: {},
    blocks: state.blocks.map((block) => {
      if (block.kind === "assistant" && block.streaming) return { ...block, streaming: false };
      if (block.kind === "tool" && !block.done) return { ...block, done: true, tail: undefined };
      return block;
    }),
  };
}

function isSettled(state: TranscriptState): boolean {
  return state.activeAssistant === -1
    && Object.keys(state.toolByCallId).length === 0
    && state.blocks.every((block) =>
      (block.kind !== "assistant" || !block.streaming) && (block.kind !== "tool" || block.done)
    );
}

export async function loadTranscriptCache(
  cwd: string,
  sessionId: string,
): Promise<TranscriptState | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(keyFor(cwd, sessionId));
    request.onsuccess = () => {
      try {
        const record = request.result as CacheRecord | undefined;
        const parsed: unknown = record ? JSON.parse(record.state) : null;
        resolve(
          isTranscriptState(parsed)
            && isSettled(parsed)
            && record?.signature === transcriptContentSignature(parsed)
            ? settle(parsed)
            : null,
        );
      } catch {
        resolve(null);
      } finally {
        db.close();
      }
    };
    request.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

export async function saveTranscriptCache(
  cwd: string,
  sessionId: string,
  state: TranscriptState,
): Promise<void> {
  if (estimateJsonUtf8Bytes(state, MAX_SERIALIZED_CHARS) > MAX_SERIALIZED_CHARS) return;
  let serialized: string;
  try {
    serialized = JSON.stringify(state);
  } catch {
    return;
  }
  if (serialized.length > MAX_SERIALIZED_CHARS) return;
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    store.put({
      key: keyFor(cwd, sessionId),
      savedAt: Date.now(),
      signature: transcriptContentSignature(state),
      state: serialized,
      size: serialized.length,
    } satisfies CacheRecord);
    let retained = 0;
    let retainedChars = 0;
    const cursor = store.index("savedAt").openCursor(null, "prev");
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      const record = entry.value as CacheRecord;
      const size = record.size ?? record.state.length;
      const keep = retained < MAX_ENTRIES
        && retainedChars + size <= MAX_TOTAL_SERIALIZED_CHARS;
      if (keep) {
        retained += 1;
        retainedChars += size;
      } else {
        entry.delete();
      }
      entry.continue();
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteTranscriptCache(cwd: string, sessionId: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(keyFor(cwd, sessionId));
    transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteTranscriptCachesForCwd(cwd: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      for (const key of request.result) {
        if (typeof key === "string" && transcriptCacheKeyBelongsToCwd(key, cwd)) store.delete(key);
      }
    };
    transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}
