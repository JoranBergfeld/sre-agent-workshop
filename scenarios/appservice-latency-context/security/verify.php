<?php

declare(strict_types=1);

// A deliberately narrow PDO boundary double: no connection, SQL engine, or server.
final class FixtureStatement extends PDOStatement
{
    private mixed $value = false;

    public function __construct(private string $placeholder, private array $rows)
    {
    }

    public function execute(?array $params = null): bool
    {
        if ($params === null || count($params) !== 1) {
            throw new RuntimeException('Bind exactly one order ID with execute().');
        }
        $key = $this->placeholder === '?' ? 0 : substr($this->placeholder, 1);
        $id = $params[$key] ?? $params[$this->placeholder] ?? null;
        if (!is_string($id)) {
            throw new RuntimeException('The order ID must remain a bound string.');
        }
        $this->value = $this->rows[$id] ?? false;
        return true;
    }

    public function fetchColumn(int $column = 0): mixed
    {
        return $this->value;
    }
}

final class FixtureDatabase extends PDO
{
    public function __construct(private array $rows)
    {
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        throw new RuntimeException('Unsafe direct SQL query: order IDs must be bound as data.');
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        if (!preg_match('/^\s*SELECT\s+status\s+FROM\s+orders\s+WHERE\s+order_id\s*=\s*(:[a-z_]\w*|\?)\s*;?\s*$/i', $query, $match)) {
            throw new RuntimeException('Expected an exact order lookup with one parameter, not interpolated SQL.');
        }
        return new FixtureStatement($match[1], $this->rows);
    }
}

try {
    if ($argc !== 2 || !is_file($argv[1])) {
        throw new RuntimeException('Usage: php security/verify.php PATH_TO_TRUSTED_LOOKUP.php');
    }
    require $argv[1];
    $database = new FixtureDatabase([
        'ORD-1042' => 'dispatched',
        "ORD-O'Neil" => 'processing',
        'ORD-NONSTRING' => 17,
    ]);
    $cases = [
        ['ORD-1042', 'dispatched'],
        ['ORD-MISSING', null],
        ["ORD-O'Neil", 'processing'],
        ["' OR '1'='1", null],
        ['ORD-NONSTRING', null],
    ];
    foreach ($cases as [$id, $expected]) {
        if (lookupOrderStatus($database, $id) !== $expected) {
            throw new RuntimeException('Exact lookup behavior failed for synthetic ID: ' . $id);
        }
    }
    echo "PASS: ordinary, missing, quoted, SQL-shaped, non-string results; no database used.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
