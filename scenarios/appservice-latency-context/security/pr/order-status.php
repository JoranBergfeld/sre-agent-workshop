<?php

declare(strict_types=1);

// Post-repair scan checkpoint: inert, unserved lookup; executable behavior unchanged.
function lookupOrderStatus(PDO $database, string $orderId): ?string
{
    $statement = $database->prepare('SELECT status FROM orders WHERE order_id = :order_id');
    $statement->execute(['order_id' => $orderId]);
    $status = $statement->fetchColumn();

    return is_string($status) ? $status : null;
}
