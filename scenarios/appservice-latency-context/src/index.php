<?php
declare(strict_types=1);

require __DIR__ . '/timing.php';
require __DIR__ . '/telemetry.php';

$started = hrtime(true);
$requestId = bin2hex(random_bytes(16));
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$deployment = is_file(__DIR__ . '/deployment.json')
    ? json_decode(file_get_contents(__DIR__ . '/deployment.json'), true)
    : ['revision' => 'source', 'prepared_at' => null];

function recordEvent(string $event, array $fields = []): void
{
    global $requestId, $path, $deployment;
    $entry = array_merge([
        'timestamp' => gmdate('c'),
        'event' => $event,
        'request_id' => $requestId,
        'route' => $path,
        'method' => $_SERVER['REQUEST_METHOD'],
        'revision' => $deployment['revision'],
        'prepared_at' => $deployment['prepared_at'],
    ], $fields);
    error_log(json_encode($entry, JSON_UNESCAPED_SLASHES));
    queueTelemetry($entry);
}

header('Content-Type: application/json');
header('X-Request-ID: ' . $requestId);
recordEvent('request.started');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    $body = ['error' => 'method_not_allowed'];
} elseif ($path === '/health') {
    $body = ['status' => 'healthy'];
} elseif ($path === '/api/orders/DEMO-1001') {
    $stageStarted = hrtime(true);
    recordEvent('stage.started', ['stage' => 'order-status']);
    pauseForOrder(20);
    recordEvent('stage.completed', [
        'stage' => 'order-status',
        'duration_ms' => (hrtime(true) - $stageStarted) / 1e6,
    ]);
    $body = [
        'orderId' => 'DEMO-1001',
        'status' => 'processing',
        'estimatedDelivery' => '2026-12-10',
    ];
} else {
    http_response_code(404);
    $body = ['error' => 'not_found'];
}

recordEvent('request.completed', [
    'status' => http_response_code() ?: 200,
    'duration_ms' => (hrtime(true) - $started) / 1e6,
]);
echo json_encode($body, JSON_UNESCAPED_SLASHES);
