<?php
header('X-WHO-Proxy: active');
// public/api/who/index.php
// Proxy for WHO data to avoid client-side CORS issues.

// Allow CORS from all hosts; adjust to your policy if needed.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Accept, Content-Type');
header('X-WHO-Proxy: active');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '';
$basePrefix = '/api/who';
$relativePath = null;

// Support deployment at sub-paths (e.g. /statistics/api/who/...).
if (preg_match('#/api/who(/.*)?$#i', $uri, $matches)) {
    $relativePath = $matches[1] ?? '/';
}

if ($relativePath === null) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid WHO proxy path.', 'uri' => $uri]);
    exit;
}

if ($relativePath === '') {
    $relativePath = '/';
}

$queryString = $_SERVER['QUERY_STRING'] ?? '';
$targetUrl = 'https://ghoapi.azureedge.net/api' . $relativePath;
if ($queryString !== '') {
    $targetUrl .= '?' . $queryString;
}

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Accept: application/json',
    'User-Agent: eurostat-estonia-dashboard/1.0',
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 500;
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/json';
$curlError = curl_error($ch);
curl_close($ch);

header('Content-Type: ' . $contentType);
http_response_code($httpCode);

if ($response === false) {
    echo json_encode(['error' => 'WHO proxy fetch failure', 'details' => $curlError]);
} else {
    echo $response;
}
