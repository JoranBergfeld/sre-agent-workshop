from typing import Literal, TypedDict

SchemaVersion = Literal["v1", "v2"]
MoneyValue = str | int | float


class ReceiptEventV1(TypedDict):
    schemaVersion: Literal["v1"]
    orderId: str
    customerId: str
    total: MoneyValue
    currency: str


class ReceiptCustomerV2(TypedDict):
    id: str


class ReceiptAmountV2(TypedDict):
    value: MoneyValue
    currency: str


class ReceiptEventV2(TypedDict):
    schemaVersion: Literal["v2"]
    id: str
    customer: ReceiptCustomerV2
    amount: ReceiptAmountV2


ReceiptEvent = ReceiptEventV1 | ReceiptEventV2
