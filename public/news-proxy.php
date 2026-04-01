<?php
// Simple proxy for Google News RSS for CORS-safe client use.
// Place this file in a PHP-enabled webserver root and call as:
// /news-proxy.php?keyword=inflation%20AND%20HICP%20AND%20annual%20rate

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Accept, Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$keyword = trim((string)($_GET['keyword'] ?? ''));
if ($keyword === '') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'keyword query param required']);
    exit;
}

// sanitize and normalize: only words + AND + when:1d in query
$keyword = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $keyword);
$parts = preg_split('/\s+/', $keyword, -1, PREG_SPLIT_NO_EMPTY);
if (!$parts || count($parts) === 0) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'invalid keyword']);
    exit;
}

$searchTerms = implode(' AND ', $parts) . ' when:1d';
$target = 'https://news.google.com/rss/search?q=' . rawurlencode($searchTerms) . '&hl=en-US&gl=US&ceid=US:en';

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
// Optional: mimic browser
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; news-proxy/1.0)');

$response = curl_exec($ch);
$err = curl_error($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $status !== 200) {
    http_response_code($status ?: 502);
    header('Content-Type: application/json');
    echo json_encode([ 'error' => 'failed to fetch from Google News RSS', 'details' => $err ]);
    exit;
}

// Return RSS as-is
header('Content-Type: application/rss+xml; charset=utf-8');
http_response_code(200);
echo $response;
