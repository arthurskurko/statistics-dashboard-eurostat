import * as React from 'react';

type NewsItem = {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
};

type NewsModalProps = {
  open: boolean;
  keyword: string;
  onClose: () => void;
};

const PAGE_SIZE = 10;

const cache = new Map<string, NewsItem[]>();

function formatRelativeTime(date: Date) {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} sec${seconds !== 1 ? 's' : ''} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function parseGoogleNewsRSS(rss: string): NewsItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rss, 'application/xml');
  const items = Array.from(doc.querySelectorAll('item'));

  const normalized = items
    .map((item) => {
      const titleNode = item.querySelector('title');
      const linkNode = item.querySelector('link');
      const pubDateNode = item.querySelector('pubDate');
      const sourceNode = item.querySelector('source');

      if (!titleNode || !linkNode || !pubDateNode) return null;

      const pubDateString = pubDateNode.textContent?.trim() ?? '';
      const parsedDate = new Date(pubDateString);
      if (Number.isNaN(parsedDate.getTime())) return null;

      return {
        title: titleNode.textContent?.trim() ?? 'Untitled',
        link: linkNode.textContent?.trim() ?? '',
        pubDate: parsedDate,
        source: sourceNode?.textContent?.trim() ?? 'Unknown',
      } as NewsItem;
    })
    .filter((value): value is NewsItem => value !== null)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return normalized;
}

export function NewsModal({ open, keyword, onClose }: NewsModalProps) {
  const [allItems, setAllItems] = React.useState<NewsItem[]>([]);
  const [visibleItems, setVisibleItems] = React.useState<NewsItem[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      setAllItems([]);
      setVisibleItems([]);
      setCurrentIndex(0);
      return;
    }

    function formatKeywordForGoogle(query: string) {
      const words = query
        .replace(/[\W_]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (words.length === 0) return '';
      const searchQuery = `${words.join(' AND ')} when:30d`;
      return searchQuery;
    }

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        if (cache.has(normalizedKeyword)) {
          const cached = cache.get(normalizedKeyword) || [];
          setAllItems(cached);
          setVisibleItems(cached.slice(0, PAGE_SIZE));
          setCurrentIndex(Math.min(PAGE_SIZE, cached.length));
          setIsLoading(false);
          return;
        }

        const formattedQuery = formatKeywordForGoogle(normalizedKeyword);
        if (!formattedQuery) {
          setAllItems([]);
          setVisibleItems([]);
          setCurrentIndex(0);
          setIsLoading(false);
          return;
        }

        function buildNewsApiCandidates(query: string): string[] {
          const common = `?keyword=${encodeURIComponent(query)}`;
          const primary = (import.meta.env.VITE_NEWS_PROXY_URL || '').trim();
          if (primary) {
            // primary can be e.g. http://localhost:8090/api/news (Go) or http://localhost:8000/news-proxy.php (PHP)
            return [`${primary.replace(/\/+$/, '')}${common}`];
          }

          const goBackendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8090').replace(/\/+$/,'');
          const phpBackendUrl = (import.meta.env.VITE_PHP_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/,'');

          return [
            `${goBackendUrl}/api/news${common}`,
            `${phpBackendUrl}/news-proxy.php${common}`,
          ];
        }

        const apiCandidates = buildNewsApiCandidates(formattedQuery);

        let text = '';
        let lastError: Error | null = null;
        for (const apiUrl of apiCandidates) {
          try {
            const res = await fetch(apiUrl);
            if (!res.ok) {
              const body = await res.text();
              throw new Error(`Fetch failed: ${res.status} ${res.statusText} - ${body}`);
            }
            text = await res.text();
            lastError = null;
            break;
          } catch (err) {
            lastError = err as Error;
          }
        }

        if (!text) {
          throw lastError ?? new Error('Unable to fetch news from backend or proxy');
        }

        const parsed = parseGoogleNewsRSS(text);

        cache.set(normalizedKeyword, parsed);

        setAllItems(parsed);
        setVisibleItems(parsed.slice(0, PAGE_SIZE));
        setCurrentIndex(Math.min(PAGE_SIZE, parsed.length));
      } catch (e) {
        setError((e as Error).message || 'Unable to load news');
        setAllItems([]);
        setVisibleItems([]);
        setCurrentIndex(0);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [open, keyword]);

  const loadMore = React.useCallback(() => {
    if (currentIndex >= allItems.length) return;
    const nextIndex = Math.min(allItems.length, currentIndex + PAGE_SIZE);
    setVisibleItems((prev) => [...prev, ...allItems.slice(currentIndex, nextIndex)]);
    setCurrentIndex(nextIndex);
  }, [allItems, currentIndex]);

  React.useEffect(() => {
    if (!open || !containerRef.current) return;
    const el = containerRef.current;
    let timeout = 0;

    const onScroll = () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(() => {
        const threshold = 150;
        if (el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold) {
          loadMore();
        }
      }, 120);
    };

    el.addEventListener('scroll', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [open, loadMore]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold">News for "{keyword}"</h2>
            <p className="text-xs text-slate-500">{allItems.length} articles matched</p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
            aria-label="Close modal"
          >
            Close
          </button>
        </div>

        <div ref={containerRef} className="h-[calc(80vh-72px)] overflow-y-auto p-4">
          {isLoading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          )}

          {error && <div className="p-4 text-red-600">Error: {error}</div>}

          {!isLoading && !error && visibleItems.length === 0 && (
            <div className="p-4 text-slate-500">No news found for this keyword.</div>
          )}

          <ul className="space-y-3">
            {visibleItems.map((item, idx) => (
              <li key={`${item.link}-${idx}`} className="rounded border border-slate-200 p-3">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-base font-medium text-blue-600 hover:text-blue-800"
                >
                  {item.title}
                </a>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>{item.source}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(item.pubDate)}</span>
                </div>
              </li>
            ))}
          </ul>

          {!isLoading && currentIndex < allItems.length && visibleItems.length > 0 && (
            <div className="mt-4 flex items-center justify-center text-sm text-slate-500">Scroll for more...</div>
          )}

          {!isLoading && currentIndex >= allItems.length && allItems.length > 0 && (
            <div className="mt-4 flex items-center justify-center text-sm text-slate-500">End of results.</div>
          )}
        </div>
      </div>
    </div>
  );
}
