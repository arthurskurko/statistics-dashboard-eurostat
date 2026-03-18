import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs';
import path from 'path';

type BuildTarget = 'local' | 'test' | 'prod';

type BuildConfig = {
  target?: BuildTarget;
  baseByTarget?: Partial<Record<BuildTarget, string>>;
};

const DEFAULT_BASE_BY_TARGET: Record<BuildTarget, string> = {
  local: '/',
  test: '/statistics-test/',
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
  if (fromEnv === 'local' || fromEnv === 'test' || fromEnv === 'prod') {
    return fromEnv;
  }

  if (config.target === 'local' || config.target === 'test' || config.target === 'prod') {
    return config.target;
  }

  return 'prod';
}

const buildConfig = readBuildConfig();
const buildTarget = resolveBuildTarget(buildConfig);
const resolvedBase = normalizeBase(
  buildConfig.baseByTarget?.[buildTarget] ?? DEFAULT_BASE_BY_TARGET[buildTarget],
);

export default defineConfig({
  base: resolvedBase,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/who': {
        target: 'https://ghoapi.azureedge.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/who/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
