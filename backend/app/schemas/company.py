from pydantic import BaseModel
from datetime import datetime


class CompanyCreate(BaseModel):
    company_name: str
    company_name_en: str | None = None
    legal_representative: str | None = None
    address: str | None = None
    postal_code: str | None = None
    sign_city: str | None = None
    work_city: str | None = None
    is_default: int = 0
    data: dict = {}


class CompanyUpdate(BaseModel):
    company_name: str | None = None
    company_name_en: str | None = None
    legal_representative: str | None = None
    address: str | None = None
    postal_code: str | None = None
    sign_city: str | None = None
    work_city: str | None = None
    is_default: int | None = None
    data: dict | None = None


class CompanyResponse(BaseModel):
    id: int
    company_name: str
    company_name_en: str | None
    legal_representative: str | None
    address: str | None
    postal_code: str | None
    sign_city: str | None
    work_city: str | None
    is_default: int
    data: dict
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}
