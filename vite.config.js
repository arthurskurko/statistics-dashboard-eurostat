var _a, _b;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs';
import path from 'path';
var DEFAULT_BASE_BY_TARGET = {
    local: '/',
    test: '/statistics-test/',
    stage: '/statistics-stage/',
    prod: '/statistics-full/',
};
function normalizeBase(value) {
    if (!value)
        return '/';
    var leading = value.startsWith('/') ? value : "/".concat(value);
    return leading.endsWith('/') ? leading : "".concat(leading, "/");
}
function readBuildConfig() {
    var configPath = path.resolve(__dirname, 'build.config.json');
    if (!fs.existsSync(configPath))
        return {};
    try {
        var raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (_a) {
        return {};
    }
}
function resolveBuildTarget(config) {
    var fromEnv = process.env.APP_TARGET;
    if (fromEnv === 'local' || fromEnv === 'test' || fromEnv === 'stage' || fromEnv === 'prod') {
        return fromEnv;
    }
    if (config.target === 'local' ||
        config.target === 'test' ||
        config.target === 'stage' ||
        config.target === 'prod') {
        return config.target;
    }
    return 'prod';
}
var buildConfig = readBuildConfig();
var buildTarget = resolveBuildTarget(buildConfig);
var assetVersion = Number.isFinite(buildConfig.assetVersion) ? Number(buildConfig.assetVersion) : 0;
var resolvedBase = normalizeBase((_b = (_a = buildConfig.baseByTarget) === null || _a === void 0 ? void 0 : _a[buildTarget]) !== null && _b !== void 0 ? _b : DEFAULT_BASE_BY_TARGET[buildTarget]);
function appendVersionQuery(url, version) {
    if (!url || /^https?:\/\//i.test(url) || url.startsWith('data:')) {
        return url;
    }
    var separator = url.includes('?') ? '&' : '?';
    return "".concat(url).concat(separator, "v=").concat(version);
}
function createCacheBustPlugin(version) {
    return {
        name: 'append-asset-version-query',
        apply: 'build',
        closeBundle: function () {
            var builtIndexPath = path.resolve(__dirname, 'dist', 'index.html');
            if (!fs.existsSync(builtIndexPath)) {
                return;
            }
            var html = fs.readFileSync(builtIndexPath, 'utf8');
            var withVersionedAssets = html
                .replace(/src="([^"]+\.js(?:\?[^"]*)?)"/g, function (_, src) {
                return "src=\"".concat(appendVersionQuery(src, version), "\"");
            })
                .replace(/href="([^"]+\.css(?:\?[^"]*)?)"/g, function (_, href) {
                return "href=\"".concat(appendVersionQuery(href, version), "\"");
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
                rewrite: function (path) { return path.replace(/^\/api\/who/, '/api'); },
            },
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 4173,
    },
});
