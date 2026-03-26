import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs';
import path from 'path';

type BuildTarget = 'local' | 'test' | 'stage' | 'prod';

type BuildConfig = {
  target?: BuildTarget;
  assetVersion?: number;
  baseByTarget?: Partial<Record<BuildTarget, string>>;
};

const DEFAULT_BASE_BY_TARGET: Record<BuildTarget, string> = {
  local: '/',
  test: '/statistics-test/',
  stage: '/statistics-stage/',
  prod: '/statistics-full/',
};

function normalizeBase(value: string): string {
  if (!value) return '/';
  const leading = value.startsWith('/') ? value : `/${value}`;
  return leading.endsWith('/') ? leading : `${leading}/`;
}

function readBuildConfig(): BuildConfig {
  const configPath = path.resolve(__dirname, 'build.config.json');
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as BuildConfig;
  } catch {
    return {};
  }
}

function resolveBuildTarget(config: BuildConfig): BuildTarget {
  const fromEnv = process.env.APP_TARGET as BuildTarget | undefined;
  if (fromEnv === 'local' || fromEnv === 'test' || fromEnv === 'stage' || fromEnv === 'prod') {
    return fromEnv;
  }

  if (
    config.target === 'local' ||
    config.target === 'test' ||
    config.target === 'stage' ||
    config.target === 'prod'
  ) {
    return config.target;
  }

  return 'prod';
}

const buildConfig = readBuildConfig();
const buildTarget = resolveBuildTarget(buildConfig);
const assetVersion = Number.isFinite(buildConfig.assetVersion) ? Number(buildConfig.assetVersion) : 0;
const resolvedBase = normalizeBase(
  buildConfig.baseByTarget?.[buildTarget] ?? DEFAULT_BASE_BY_TARGET[buildTarget],
);

function appendVersionQuery(url: string, version: number): string {
  if (!url || /^https?:\/\//i.test(url) || url.startsWith('data:')) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

function createCacheBustPlugin(version: number) {
  return {
    name: 'append-asset-version-query',
    apply: 'build' as const,
    closeBundle() {
      const builtIndexPath = path.resolve(__dirname, 'dist', 'index.html');
      if (!fs.existsSync(builtIndexPath)) {
        return;
      }

      const html = fs.readFileSync(builtIndexPath, 'utf8');

      const withVersionedAssets = html
        .replace(/src="([^"]+\.js(?:\?[^"]*)?)"/g, (_, src: string) => {
          return `src="${appendVersionQuery(src, version)}"`;
        })
        .replace(/href="([^"]+\.css(?:\?[^"]*)?)"/g, (_, href: string) => {
          return `href="${appendVersionQuery(href, version)}"`;
        });

      fs.writeFileSync(builtIndexPath, withVersionedAssets);
    },
  };
}

export default defineConfig({
  base: resolvedBase,
  plugins: [react(), createCacheBustPlugin(assetVersion)],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/who': {
        target: 'https://ghoapi.azureedge.net',
        changeOrigin: true,
        secure: true,
        // keep /api prefix for WHO endpoint; client uses /api/who/.. and we translate to /api/..
        rewrite: (path) => path.replace(/^\/api\/who/, '/api'),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
