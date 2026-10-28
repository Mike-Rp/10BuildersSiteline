# Philippine location catalog

This bundled snapshot contains 18 regions, 82 provinces, and 1,642 cities/municipalities. Manila's 14 sub-municipal districts are excluded because allocation is at city/municipality level, so Manila remains one city. No barangays, coordinates, population, or ZIP codes are shipped.

## Provenance

- Authoritative geographic classification: Philippine Statistics Authority, https://psa.gov.ph/classification/psgc .
- Extract source: community-maintained `fish-and-bear/psgc`, commit `e360c9da26ae9455f357ab7d048389a1a8f05c2a`, https://github.com/fish-and-bear/psgc/tree/e360c9da26ae9455f357ab7d048389a1a8f05c2a/psgc/data/core . The upstream describes its geographic names/codes as PSA PSGC Q1 2026, with Q4 2025 as the base. This is not a direct PSA download or a claim to include Q2/Q3 2026 changes.
- Source files: `regions.json`, `provinces.json`, `cities.json`. The MIT notice is preserved in `PSGC-LICENSE.txt`.
- Retrieval date: October 28, 2026. The official Q3 2026 workbook could not be retrieved because the download endpoint required a website verification challenge. Do not replace this snapshot silently with an unversioned runtime request.

## Application transformations

Only official city/municipality PSGC codes are persisted as `psgcCode`. The province selector includes the 82 real provinces, Metro Manila, a Special Geographic Area group, and region-specific **Independent cities (no province)** groups. The additional group identifiers are UI identifiers, not official province PSGC codes. Independent cities are not falsely attached to provinces. The existing postal-style Cebu/Cebu City representation is recognized for legacy records using the upstream correspondence-code province mapping, within the explicitly stated region. Similar exact city aliases (City of Cebu / Cebu City) and region aliases (Region VII (Central Visayas) / Central Visayas) resolve to the same city code. No fuzzy address or cross-region match is allowed.

The frontend and API import the same catalog. New selections carry canonical names and a city code; forged codes or mismatched parents fail validation. Old unmatched records retain their displayed text, but require explicit reselection before new allocation. Existing active allocations are not rewritten.

## Updating

Review the next PSA release before replacing the snapshot. Retain the source version, immutable upstream revision, license, and transformation rules. Compare counts, parent relationships, changed names, Negros Island Region, Sulu's region, NCR, independent cities, and duplicate city names. Run the catalog, UI, backend, type and build checks after updating. Updates are deliberate application releases; no runtime token or third-party network service is needed.
