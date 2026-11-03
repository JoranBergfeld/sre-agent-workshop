<?php

declare(strict_types=1);

// Intentionally unsafe, inert teaching fixture. Never route, merge, or deploy.
// Scan checkpoint only: this fixture remains unserved and database-disconnected.
function lookupOrderStatus(PDO $database, string $orderId): ?string
{
    $query = "SELECT status FROM orders WHERE order_id = '{$orderId}'";
    $status = $database->query($query)->fetchColumn();

    return is_string($status) ? $status : null;
}
