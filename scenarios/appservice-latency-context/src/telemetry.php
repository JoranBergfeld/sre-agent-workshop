<?php
declare(strict_types=1);

$telemetryEvents = [];

function queueTelemetry(array $entry): void
{
    global $telemetryEvents;
    $telemetryEvents[] = $entry;
}

register_shutdown_function(function (): void {
    global $telemetryEvents;
    $connection = getenv('APPLICATIONINSIGHTS_CONNECTION_STRING');
    if (!$connection || !$telemetryEvents) {
        return;
    }
    $settings = [];
    foreach (explode(';', $connection) as $part) {
        $pair = explode('=', $part, 2);
        if (count($pair) === 2) {
            $settings[strtolower($pair[0])] = $pair[1];
        }
    }
    $endpoint = rtrim($settings['ingestionendpoint'] ?? '', '/');
    if (!str_starts_with($endpoint, 'https://') || empty($settings['instrumentationkey'])) {
        error_log('Telemetry configuration is incomplete');
        return;
    }
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }
    $batch = [];
    foreach ($telemetryEvents as $entry) {
        $request = $entry['event'] === 'request.completed';
        $data = $request ? [
            'ver' => 2,
            'id' => $entry['request_id'],
            'name' => $entry['method'] . ' ' . $entry['route'],
            'duration' => sprintf('00:00:%09.6f', $entry['duration_ms'] / 1000),
            'responseCode' => (string) $entry['status'],
            'success' => $entry['status'] < 400,
            'url' => 'https://' . (getenv('WEBSITE_HOSTNAME') ?: 'localhost') . $entry['route'],
            'properties' => array_map('strval', $entry),
        ] : [
            'ver' => 2, 'message' => $entry['event'], 'severityLevel' => 1,
            'properties' => array_map('strval', $entry),
        ];
        $batch[] = [
            'name' => $request ? 'Microsoft.ApplicationInsights.Request' : 'Microsoft.ApplicationInsights.Message',
            'time' => $entry['timestamp'], 'iKey' => $settings['instrumentationkey'],
            'tags' => [
                'ai.operation.id' => $entry['request_id'],
                'ai.cloud.role' => getenv('WEBSITE_SITE_NAME') ?: 'appservice-latency-context',
            ],
            'data' => ['baseType' => $request ? 'RequestData' : 'MessageData', 'baseData' => $data],
        ];
    }
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'header' => "Content-Type: application/json\r\n",
        'content' => json_encode($batch), 'timeout' => 2, 'ignore_errors' => true,
    ]]);
    $result = @file_get_contents($endpoint . '/v2/track', false, $context);
    if ($result === false || !preg_match('/^HTTP\/\S+ 200\b/', $http_response_header[0] ?? '')) {
        error_log('Telemetry export failed; inspect connection, egress and ingestion response');
    }
});
