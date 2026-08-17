from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import cast

from order_events.contracts import ReceiptEventV1, SchemaVersion

from .errors import InvalidReceiptEventError, UnsupportedReceiptSchemaError


@dataclass(frozen=True, slots=True)
class NormalizedReceipt:
    sourceSchemaVersion: SchemaVersion
    customerId: str
    amountMinor: int
    currency: str
    orderId: str


def normalize_receipt(payload: object) -> NormalizedReceipt:
    event = _require_mapping(payload)
    schema_version = _require_schema_version(event)

    if schema_version == "v1":
        return _normalize_v1(cast(ReceiptEventV1, event))

    raise UnsupportedReceiptSchemaError(schema_version)


def _normalize_v1(event: ReceiptEventV1) -> NormalizedReceipt:
    return NormalizedReceipt(
        sourceSchemaVersion="v1",
        customerId=_require_non_empty_string(event.get("customerId"), "customerId"),
        amountMinor=_parse_minor_units(event.get("total"), "total"),
        currency=_parse_currency(event.get("currency")),
        orderId=_require_non_empty_string(event.get("orderId"), "orderId"),
    )


def _require_mapping(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise InvalidReceiptEventError("payload must be an object")

    return payload


def _require_schema_version(event: dict[str, object]) -> SchemaVersion:
    raw_schema_version = event.get("schemaVersion")
    if raw_schema_version is None:
        raise InvalidReceiptEventError("schemaVersion is required")
    if raw_schema_version not in {"v1", "v2"}:
        raise InvalidReceiptEventError("schemaVersion must be one of: v1, v2")

    return cast(SchemaVersion, raw_schema_version)


def _require_non_empty_string(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InvalidReceiptEventError(f"{field_name} must be a non-empty string")

    return value.strip()


def _parse_currency(value: object) -> str:
    currency = _require_non_empty_string(value, "currency").upper()
    if len(currency) != 3 or not currency.isalpha():
        raise InvalidReceiptEventError("currency must be a three-letter alphabetic code")

    return currency


def _parse_minor_units(value: object, field_name: str) -> int:
    if not isinstance(value, str | int | float):
        raise InvalidReceiptEventError(
            f"{field_name} must be a non-negative amount with at most 2 decimal places"
        )

    try:
        decimal_value = Decimal(str(value))
    except InvalidOperation as error:
        raise InvalidReceiptEventError(
            f"{field_name} must be a non-negative amount with at most 2 decimal places"
        ) from error

    if not decimal_value.is_finite() or decimal_value < 0:
        raise InvalidReceiptEventError(
            f"{field_name} must be a non-negative amount with at most 2 decimal places"
        )

    exponent = decimal_value.as_tuple().exponent
    if not isinstance(exponent, int) or exponent < -2:
        raise InvalidReceiptEventError(
            f"{field_name} must be a non-negative amount with at most 2 decimal places"
        )

    return int(decimal_value * 100)
