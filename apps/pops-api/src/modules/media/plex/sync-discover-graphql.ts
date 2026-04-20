import { getPlexClientId } from './service.js';
import { PlexApiError } from './types.js';

export interface ActivityWatchEntry {
  id: string;
  date: string;
  metadataItem: {
    id: string;
    title: string;
    type: string;
    parent: { title: string; index: number } | null;
    grandparent: { title: string } | null;
    year: number | null;
    index: number;
  };
}

export interface WatchHistoryPage {
  nodes: ActivityWatchEntry[];
  hasNextPage: boolean;
  endCursor: string | null;
}

const GRAPHQL_PAGE_SIZE = 50;

const WATCH_HISTORY_QUERY = `
query GetWatchHistoryHub($uuid: ID = "", $first: PaginationInt!, $after: String) {
  user(id: $uuid) {
    watchHistory(first: $first, after: $after) {
      nodes {
        id
        date
        metadataItem {
          id
          title
          type
          index
          year
          parent { title, index }
          grandparent { title }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

const ACTIVITY_FEED_QUERY = `
query GetActivityFeed($first: PaginationInt!, $metadataID: ID, $types: [ActivityType!]!) {
  activityFeed(first: $first, metadataID: $metadataID, types: $types) {
    nodes { date, id, metadataItem { id, title, type } }
  }
}`;

/** Send a GraphQL request to the Plex community API. */
async function communityGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  operationName: string
): Promise<T> {
  const clientId = getPlexClientId();
  const res = await fetch('https://community.plex.tv/api', {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      'x-plex-token': token,
      'x-plex-client-identifier': clientId,
      'x-plex-product': 'POPS',
    },
    body: JSON.stringify({ query, variables, operationName }),
  });

  if (!res.ok) {
    throw new PlexApiError(res.status, `Community API error: ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0]?.message}`);
  }
  if (!json.data) {
    throw new Error('GraphQL response missing data');
  }
  return json.data;
}

export async function fetchWatchHistoryPage(
  token: string,
  uuid: string,
  after: string | null
): Promise<WatchHistoryPage> {
  const variables: Record<string, unknown> = { first: GRAPHQL_PAGE_SIZE, uuid };
  if (after) variables.after = after;

  const data = await communityGraphQL<{
    user?: {
      watchHistory?: {
        nodes?: ActivityWatchEntry[];
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    };
  }>(token, WATCH_HISTORY_QUERY, variables, 'GetWatchHistoryHub');

  const history = data.user?.watchHistory;
  return {
    nodes: history?.nodes ?? [],
    hasNextPage: history?.pageInfo?.hasNextPage ?? false,
    endCursor: history?.pageInfo?.endCursor ?? null,
  };
}

export async function fetchActivityForItem(
  token: string,
  ratingKey: string
): Promise<Array<{ date: string }>> {
  const data = await communityGraphQL<{
    activityFeed?: { nodes?: Array<{ date: string }> };
  }>(
    token,
    ACTIVITY_FEED_QUERY,
    { first: 50, metadataID: ratingKey, types: ['WATCH_HISTORY'] },
    'GetActivityFeed'
  );
  return data.activityFeed?.nodes ?? [];
}

export async function fetchAccountUuid(token: string): Promise<string> {
  const res = await fetch('https://plex.tv/api/v2/user', {
    headers: { Accept: 'application/json', 'X-Plex-Token': token },
  });
  if (!res.ok) throw new PlexApiError(res.status, 'Failed to fetch Plex account info');
  const data = (await res.json()) as { uuid?: string };
  if (!data.uuid) throw new Error('Plex account UUID not found');
  return data.uuid;
}
