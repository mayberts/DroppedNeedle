import type { Query } from '@tanstack/svelte-query';
import { invalidateQueriesWithPersister } from '$lib/queries/QueryClient';
import { ArtistQueryKeyFactory } from '$lib/queries/artist/ArtistQueryKeyFactory';
import { DiscoverQueryKeyFactory } from '$lib/queries/discover/DiscoverQueryKeyFactory';
import { HomeQueryKeyFactory } from '$lib/queries/HomeQueryKeyFactory';
import { ArtistReconciliationQueryKeyFactory } from '$lib/queries/artist-reconciliation/ArtistReconciliationQueryKeyFactory';
import { LyricsQueryKeyFactory } from '$lib/queries/lyrics/LyricsQueryKeyFactory';
import { searchStore } from '$lib/stores/search';
import { LibraryQueryKeyFactory } from './LibraryQueryKeyFactory';

function matchesPrefix(key: readonly unknown[], prefix: readonly unknown[]): boolean {
	return prefix.every((segment, index) => key[index] === segment);
}

// A single open detail page (album/artist) shouldn't be force-refetched every
// time ANYTHING elsewhere in the catalog changes - the backend's catalog
// revision is one scalar covering the whole library, so a busy background
// scan/hygiene pass bumps it continuously. Detail pages already refetch on
// their own for the events that actually concern them (downloads settling,
// contributions, etc.), so exclude them here; grids/lists still need the
// live refresh to show newly added/removed items.
function isDetailPageQueryKey(key: readonly unknown[]): boolean {
	if (key[0] === 'library') return key[1] === 'album-detail' || key[1] === 'artist-detail';
	// ArtistQueryKeyFactory.basic(id) is the only 2-element key in this
	// namespace - every other artist query key has a 3rd segment naming the
	// sub-resource (extended/top-albums/top-songs/...).
	if (key[0] === 'artist') return key.length === 2;
	return false;
}

function catalogPredicate(prefix: readonly unknown[]): (query: Query) => boolean {
	return (query) =>
		matchesPrefix(query.queryKey, prefix) && !isDetailPageQueryKey(query.queryKey);
}

export async function invalidateLibraryCatalog(): Promise<void> {
	searchStore.clear();
	await Promise.all([
		invalidateQueriesWithPersister({ predicate: catalogPredicate(LibraryQueryKeyFactory.all) }),
		invalidateQueriesWithPersister({ predicate: catalogPredicate(ArtistQueryKeyFactory.prefix) }),
		invalidateQueriesWithPersister({ queryKey: HomeQueryKeyFactory.prefix }),
		invalidateQueriesWithPersister({ queryKey: DiscoverQueryKeyFactory.prefix }),
		invalidateQueriesWithPersister({ queryKey: ArtistReconciliationQueryKeyFactory.prefix }),
		invalidateQueriesWithPersister({ queryKey: LyricsQueryKeyFactory.prefix })
	]);
}
