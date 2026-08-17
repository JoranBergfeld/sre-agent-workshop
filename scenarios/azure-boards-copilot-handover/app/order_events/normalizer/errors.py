class InvalidReceiptEventError(ValueError):
    """Raised when an order event does not satisfy the receipt contract."""


class UnsupportedReceiptSchemaError(ValueError):
    """Raised when a valid order event uses an unsupported schema version."""

    def __init__(self, schema_version: str) -> None:
        super().__init__(f"schemaVersion {schema_version!r} is not supported")
        self.schema_version = schema_version
