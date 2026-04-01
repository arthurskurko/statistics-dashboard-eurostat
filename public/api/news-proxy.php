<?php
// API-based proxy for Google News RSS search, used when no a Go backend is available.

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

// Sanitize to keep text-only and spaces, then preserve "when:" suffix if present.
$keyword = preg_replace('/[^\p{L}\p{N}\s:\-]/u', ' ', $keyword);
$keyword = preg_replace('/\s+/u', ' ', $keyword);
$keyword = trim($keyword);

// Build Google News query url.
$url = 'https://news.google.com/rss/search?q=' . rawurlencode($keyword) . '&hl=en-US&gl=US&ceid=US:en';

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; news-proxy/1.0)');

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($response === false || $status !== 200) {
  http_response_code($status ?: 502);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'failed to fetch from Google News RSS', 'details' => $error]);
  exit;
}

header('Content-Type: application/rss+xml; charset=utf-8');
http_response_code(200);
echo $response;
