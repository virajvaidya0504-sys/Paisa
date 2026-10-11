"""Request bodies (Pydantic validates them before our code runs)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PaymentMethod = Literal["upi", "card", "cash", "bank_transfer", "other"]


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name cannot be blank")
        return v


class RuleIn(BaseModel):
    pattern: str = Field(min_length=1, max_length=80)
    tag_id: int
    priority: int = 0

    @field_validator("pattern")
    @classmethod
    def strip_pattern(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("pattern cannot be blank")
        return v


class TransactionIn(BaseModel):
    date_time: datetime | None = None  # defaults to "now" for Quick Add
    amount: float = Field(gt=0, description="Rupees, e.g. 249.50")
    type: Literal["debit", "credit"] = "debit"
    payee: str = Field(min_length=1, max_length=120)
    payment_method: PaymentMethod = "upi"
    tag_id: int | None = None  # None -> auto-tag rules decide (else stays untagged)
    note: str = Field(default="", max_length=500)
    status: Literal["completed", "pending"] = "completed"
    upi_id: str | None = Field(default=None, max_length=100)

    @field_validator("payee")
    @classmethod
    def strip_payee(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("payee cannot be blank")
        return v
