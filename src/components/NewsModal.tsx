import * as React from 'react';
import { createPortal } from 'react-dom';

type NewsItem = {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  imageUrl?: string;
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
      const mediaNode = item.querySelector('enclosure') || item.getElementsByTagName('media:content')[0] || item.getElementsByTagName('media\:content')[0];
      const descriptionNode = item.querySelector('description');

      if (!titleNode || !linkNode || !pubDateNode) return null;

      const pubDateString = pubDateNode.textContent?.trim() ?? '';
      const parsedDate = new Date(pubDateString);
      if (Number.isNaN(parsedDate.getTime())) return null;

      let imageUrl = undefined;
      if (mediaNode instanceof Element) {
        imageUrl = mediaNode.getAttribute('url') || undefined;
      }
      if (!imageUrl && descriptionNode?.textContent) {
        const match = descriptionNode.textContent.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
        if (match && match[1]) imageUrl = match[1];
      }

      return {
        title: titleNode.textContent?.trim() ?? 'Untitled',
        link: linkNode.textContent?.trim() ?? '',
        pubDate: parsedDate,
        source: sourceNode?.textContent?.trim() ?? 'Unknown',
        imageUrl,
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
  const [searchTerm, setSearchTerm] = React.useState(keyword);
  const [searchQuery, setSearchQuery] = React.useState(keyword);
  const [timeRange, setTimeRange] = React.useState<'1d' | '7d' | '30d' | '360d' | 'all'>('30d');
  const [queryRevision, setQueryRevision] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setSearchTerm(keyword);
      setSearchQuery(keyword);
      setQueryRevision((prev) => prev + 1);
    }
  }, [open, keyword]);

  React.useEffect(() => {
    if (!open) return;

    const normalizedKeyword = searchQuery.trim();
    if (!normalizedKeyword) {
      setAllItems([]);
      setVisibleItems([]);
      setCurrentIndex(0);
      return;
    }

    function formatKeywordForGoogle(query: string, timeframe: '1d' | '7d' | '30d' | '360d' | 'all') {
      const words = query
        .replace(/[\W_]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (words.length === 0) return '';
      const base = words.join(' AND ');
      if (timeframe === 'all') return base;
      return `${base} when:${timeframe}`;
    }

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const cacheKey = `${normalizedKeyword}::${timeRange}`;
        if (cache.has(cacheKey)) {
          const cached = cache.get(cacheKey) || [];
          setAllItems(cached);
          setVisibleItems(cached.slice(0, PAGE_SIZE));
          setCurrentIndex(Math.min(PAGE_SIZE, cached.length));
          setIsLoading(false);
          return;
        }

        const formattedQuery = formatKeywordForGoogle(normalizedKeyword, timeRange);
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
            return [`${primary.replace(/\/+$/, '')}${common}`];
          }

          const goBackendUrlCandidate = (import.meta.env.VITE_BACKEND_URL || '').trim();
          const phpBackendUrlCandidate = (import.meta.env.VITE_PHP_BACKEND_URL || '').trim();

          const normalizedGo = goBackendUrlCandidate.replace(/\/+$/, '');
          const normalizedPhp = phpBackendUrlCandidate.replace(/\/+$/, '');

          // Priority: direct override (high), then PHP backend URL, then Go backend URL, then fallback.
          if (normalizedPhp) {
            let phpUrl = normalizedPhp;
            if (phpUrl.endsWith('/api')) {
              phpUrl = `${phpUrl}/news-proxy.php`;
            } else if (phpUrl.endsWith('/news-proxy.php')) {
              // already good
            } else if (/\/api\/?$/.test(phpUrl)) {
              phpUrl = phpUrl.replace(/\/api\/?$/, '/api/news-proxy.php');
            } else {
              phpUrl = `${phpUrl}/news-proxy.php`;
            }
            return [`${phpUrl}${common}`];
          }

          if (normalizedGo) {
            let newsUrl = normalizedGo;
            if (newsUrl.endsWith('/api/news')) {
              // already good
            } else if (newsUrl.endsWith('/api')) {
              newsUrl = `${newsUrl}/news`;
            } else if (/\/api\/?$/.test(newsUrl)) {
              newsUrl = newsUrl.replace(/\/api\/?$/, '/api/news');
            } else if (newsUrl.includes('/api/')) {
              newsUrl = newsUrl.replace(/\/api\/.*/, '/api/news');
            } else {
              newsUrl = `${newsUrl}/api/news`;
            }
            return [`${newsUrl}${common}`];
          }

          // no explicit environment provided => best fallback list
          return [`/api/news${common}`, `/api/news-proxy.php${common}`];
        }

        const apiCandidates = buildNewsApiCandidates(formattedQuery);

        if (import.meta.env.DEV) {
          console.debug('NewsModal apiCandidates', apiCandidates);
        }

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

        cache.set(`${normalizedKeyword}::${timeRange}`, parsed);

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
  }, [open, searchQuery, timeRange, queryRevision]);

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

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:py-6">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/20 bg-slate-950/95 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">News search</h2>
            <p className="text-xs text-slate-500">{allItems.length} articles found</p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
            aria-label="Close modal"
          >
            Close
          </button>
        </div>

          <div className="sticky top-16 z-10 border-b border-white/10 bg-slate-950/95 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(searchTerm);
              setQueryRevision((prev) => prev + 1);
            }}
            className="flex flex-col gap-2"
          >
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="Search news keywords"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as '1d' | '7d' | '30d' | '360d' | 'all')}
                className="w-full rounded border border-slate-300 px-2 py-2 text-sm outline-none sm:w-auto"
                aria-label="Time range"
              >
                <option value="1d">1 day</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="360d">360 days</option>
                <option value="all">Unlimited</option>
              </select>
              <button
                type="submit"
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
              >
              Search
              </button>
            </div>
          </form>
        </div>

        <div ref={containerRef} className="h-[calc(80vh-112px)] overflow-y-auto p-4">
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

  return createPortal(modalContent, document.body);
}
