import {
  type PlexEpisode,
  type PlexExternalId,
  type PlexMediaItem,
  type RawPlexEpisode,
  type RawPlexMediaItem,
} from './types.js';

/** Parse Plex Guid array into structured external IDs. */
export function parseGuids(guids: RawPlexMediaItem['Guid'] | undefined): PlexExternalId[] {
  if (!guids) return [];
  return guids
    .map((g) => {
      const match = g.id.match(/^(\w+):\/\/(.+)$/);
      if (!match) return null;
      return { source: match[1], id: match[2] };
    })
    .filter((id): id is PlexExternalId => id !== null);
}

const NULLABLE_SCALAR_KEYS = [
  ['originalTitle', 'originalTitle'],
  ['summary', 'summary'],
  ['tagline', 'tagline'],
  ['year', 'year'],
  ['thumbUrl', 'thumb'],
  ['artUrl', 'art'],
  ['durationMs', 'duration'],
  ['lastViewedAt', 'lastViewedAt'],
  ['rating', 'rating'],
  ['audienceRating', 'audienceRating'],
  ['contentRating', 'contentRating'],
  ['leafCount', 'leafCount'],
  ['viewedLeafCount', 'viewedLeafCount'],
  ['childCount', 'childCount'],
] as const satisfies ReadonlyArray<readonly [keyof PlexMediaItem, keyof RawPlexMediaItem]>;

function readScalars(raw: RawPlexMediaItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [outKey, rawKey] of NULLABLE_SCALAR_KEYS) {
    out[outKey] = raw[rawKey] ?? null;
  }
  return out;
}

export function mapMediaItem(raw: RawPlexMediaItem): PlexMediaItem {
  return {
    ratingKey: raw.ratingKey,
    type: raw.type,
    title: raw.title,
    addedAt: raw.addedAt,
    updatedAt: raw.updatedAt,
    viewCount: raw.viewCount ?? 0,
    externalIds: parseGuids(raw.Guid),
    genres: (raw.Genre ?? []).map((g) => g.tag),
    directors: (raw.Director ?? []).map((d) => d.tag),
    ...readScalars(raw),
  } as PlexMediaItem;
}

export function mapEpisode(raw: RawPlexEpisode): PlexEpisode {
  return {
    ratingKey: raw.ratingKey,
    title: raw.title,
    episodeIndex: raw.index,
    seasonIndex: raw.parentIndex,
    summary: raw.summary ?? null,
    thumbUrl: raw.thumb ?? null,
    durationMs: raw.duration ?? null,
    addedAt: raw.addedAt,
    updatedAt: raw.updatedAt,
    lastViewedAt: raw.lastViewedAt ?? null,
    viewCount: raw.viewCount ?? 0,
  };
}
