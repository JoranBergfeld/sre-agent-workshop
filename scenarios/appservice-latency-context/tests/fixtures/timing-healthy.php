<?php
declare(strict_types=1);

function pauseForOrder(int $milliseconds): void
{
    usleep($milliseconds * 1000);
}
