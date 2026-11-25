"use client";

import { useEffect, useState } from "react";
import { buildSearchIndex, type IndexData, type SearchIndex } from "./place-search";

const KEY = "miel_places_index";
let cached: { version: string; index: SearchIndex } | null = null;
let pending: Promise<SearchIndex | null> | null = null;

/**
 * Loads the place search index when checkout opens (lazy, never on other pages) and keeps it: in memory, in the browser's HTTP cache
 * (the URL is versioned and immutable) and in localStorage, so a slow or flaky connection only ever downloads it once per version.
 * Returns null while loading or when it could not be loaded (the dropdowns still work then).
 */
export function usePlaceIndex(version: string): SearchIndex | null {
  const [index, setIndex] = useState<SearchIndex | null>(cached && cached.version === version ? cached.index : null);
  useEffect(() => {
    if (cached && cached.version === version) {
      setIndex(cached.index);
      return;
    }
    let live = true;
    pending ??= load(version);
    pending.then((i) => live && i && setIndex(i));
    return () => {
      live = false;
    };
  }, [version]);
  return index;
}

async function load(version: string): Promise<SearchIndex | null> {
  try {
    // 1. the copy kept from an earlier visit (same version)
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as IndexData;
        if (data.v === version) return remember(data);
      }
    } catch {
      /* storage blocked or damaged: download it */
    }
    // 2. download (gzip, versioned URL, cached for good by the browser)
    const res = await fetch(`/api/locations/index?v=${encodeURIComponent(version)}`, { cache: "force-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as IndexData;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* quota or private mode: the HTTP cache still has it */
    }
    return remember(data);
  } catch {
    pending = null; // allow a retry on the next visit
    return null;
  }
}

function remember(data: IndexData): SearchIndex {
  const index = buildSearchIndex(data);
  cached = { version: data.v, index };
  return index;
}
