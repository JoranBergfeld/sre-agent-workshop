<?php
declare(strict_types=1);

function pauseForOrder(int $milliseconds): void
{
    sleep($milliseconds);
}
