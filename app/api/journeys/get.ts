import { auth } from '@clerk/nextjs/server';
import { decode, encode } from 'cborg';
import { z } from 'zod';

import {
  type ListJourneysResponse,
  listJourneysResponseSchema,
} from '@/lib/api/journeys';
import { listJourneys } from '@/lib/server/journeys/list';

export type { ListJourneysResponse };

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  pageToken: z.string().optional(),
});

type Query = z.infer<typeof querySchema>;

// Single-letter keys keep the serialized token short while remaining legible
// when decoded: u = updatedAt (ms), i = id.
const cursorSchema = z.object({
  u: z.number().int(),
  i: z.string().length(10),
});

/** Decoded pagination cursor for the journeys list endpoint. */
export type PageToken = {
  /** `updatedAt` timestamp of the last item on the previous page. */
  updatedAt: Date;
  /** `id` of the last item on the previous page. */
  id: string;
};

/**
 * Encodes a pagination cursor as a CBOR object serialized to base64url.
 * Wire format: `{ u: updatedAtMs, i: id }` — single-letter keys for brevity.
 *
 * @param updatedAt - The `updatedAt` timestamp of the last item on the page.
 * @param id - The `id` of the last item on the page.
 * @returns An opaque base64url token string.
 */
export function encodePageToken(token: PageToken): string {
  const bytes = encode({ u: token.updatedAt.getTime(), i: token.id });
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Decodes a base64url CBOR pagination cursor.
 * Returns `null` if the token is malformed or fails validation.
 *
 * @param token - The opaque token from a previous `nextPageToken` response field.
 * @returns The decoded cursor, or `null` if the token is invalid.
 *
 * @example
 * const cursor = decodePageToken(rawToken);
 * if (cursor === null) return new Response('Bad Request', { status: 400 });
 */
export function decodePageToken(token: string): PageToken | null {
  try {
    const bytes = Buffer.from(token, 'base64url');
    const raw = decode(bytes);
    const result = cursorSchema.safeParse(raw);
    if (!result.success) {
      return null;
    }
    return { updatedAt: new Date(result.data.u), id: result.data.i };
  } catch {
    return null;
  }
}

/** Parameters for {@link getJourneysPage}. */
type GetJourneysPageParams = {
  /** Clerk user ID — results are scoped to this user. */
  userId: string;
  /** Maximum items to return. Defaults to 10. */
  limit?: number;
  /** Decoded cursor from a previous page's `nextPageToken`. */
  cursor?: PageToken;
};

/**
 * Fetches one page of journeys and returns the assembled response body,
 * including the encoded `nextPageToken` when more pages exist.
 *
 * @param params - The user, page size, and optional decoded cursor.
 * @returns A validated list-journeys response.
 */
export async function getJourneysPage({
  userId,
  limit = 10,
  cursor,
}: GetJourneysPageParams): Promise<ListJourneysResponse> {
  const fetched = await listJourneys({ userId, limit: limit + 1, ...cursor });
  const hasMore = fetched.length > limit;
  const items = hasMore ? fetched.slice(0, limit) : fetched;
  const last = items.at(-1);
  return {
    items,
    nextPageToken:
      hasMore && last !== undefined ? encodePageToken(last) : undefined,
  };
}

export async function GET(req: Request): Promise<Response> {
  const { userId } = await auth();
  if (userId === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let query: Query;
  try {
    query = querySchema.parse(Object.fromEntries(searchParams));
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { limit, pageToken: rawToken } = query;

  let cursor: PageToken | undefined;
  if (rawToken !== undefined) {
    const decoded = decodePageToken(rawToken);
    if (decoded === null) {
      return new Response('Bad Request', { status: 400 });
    }
    cursor = decoded;
  }

  return Response.json(
    listJourneysResponseSchema.parse(
      await getJourneysPage({ userId, limit, cursor }),
    ),
  );
}
