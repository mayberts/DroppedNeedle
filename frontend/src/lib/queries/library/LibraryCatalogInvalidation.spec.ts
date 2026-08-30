import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const clearSearch = vi.hoisted(() => vi.fn());

vi.mock('$lib/queries/QueryClient', () => ({
	invalidateQueriesWithPersister: invalidate
}));

vi.mock('$lib/stores/search', () => ({
	searchStore: { clear: clearSearch }
}));

import { invalidateLibraryCatalog } from './LibraryCatalogInvalidation';

function query(queryKey: readonly unknown[]) {
	return { queryKey } as { queryKey: readonly unknown[] };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('invalidateLibraryCatalog', () => {
	it('sweeps catalog, artist, discovery, reconciliation and lyrics caches', async () => {
		await invalidateLibraryCatalog();
		const filtersByCall = invalidate.mock.calls.map(([filters]) => filters);
		const plainKeys = filtersByCall.map((f) => f.queryKey).filter(Boolean);

		expect(clearSearch).toHaveBeenCalledOnce();
		expect(plainKeys).toContainEqual(['home']);
		expect(plainKeys).toContainEqual(['discover']);
		expect(plainKeys).toContainEqual(['library', 'artist-reconciliation']);
		expect(plainKeys).toContainEqual(['lyrics']);
		// library and artist sweeps use a predicate (see below) instead of a
		// plain prefix key, so a stuck detail-page query doesn't get swept
		// back into a refetch loop on every unrelated catalog change.
		expect(filtersByCall.filter((f) => typeof f.predicate === 'function')).toHaveLength(2);
	});

	it("excludes open album/artist detail pages from the library sweep so they don't refetch forever", async () => {
		await invalidateLibraryCatalog();
		const libraryPredicate = invalidate.mock.calls
			.map(([filters]) => filters)
			.find((f) => typeof f.predicate === 'function' && f.predicate(query(['library', 'albums'])))
			?.predicate as (q: ReturnType<typeof query>) => boolean;
		expect(libraryPredicate).toBeTypeOf('function');

		// grids/lists that should keep refreshing live
		expect(libraryPredicate(query(['library', 'albums']))).toBe(true);
		expect(libraryPredicate(query(['library', 'artists']))).toBe(true);
		expect(libraryPredicate(query(['library', 'album-copies', 'alb-1']))).toBe(true);

		// open detail pages, which refetch on their own targeted triggers -
		// must NOT be swept by an unrelated catalog bump
		expect(libraryPredicate(query(['library', 'album-detail', 'alb-1']))).toBe(false);
		expect(libraryPredicate(query(['library', 'artist-detail', 'art-1']))).toBe(false);

		// unrelated namespace entirely
		expect(libraryPredicate(query(['home']))).toBe(false);
	});

	it("excludes the open provider artist page's basic query from the artist sweep", async () => {
		await invalidateLibraryCatalog();
		const artistPredicate = invalidate.mock.calls
			.map(([filters]) => filters)
			.find((f) => typeof f.predicate === 'function' && f.predicate(query(['artist', 'a1', 'extended'])))
			?.predicate as (q: ReturnType<typeof query>) => boolean;
		expect(artistPredicate).toBeTypeOf('function');

		// sub-resources for an artist page keep refreshing live
		expect(artistPredicate(query(['artist', 'a1', 'extended']))).toBe(true);
		expect(artistPredicate(query(['artist', 'a1', 'top-albums', { source: 'local' }]))).toBe(true);

		// the open page's own basic() query - a 2-element key - must not be
		// swept by an unrelated catalog bump
		expect(artistPredicate(query(['artist', 'a1']))).toBe(false);

		// unrelated namespace entirely
		expect(artistPredicate(query(['library', 'albums']))).toBe(false);
	});
});
