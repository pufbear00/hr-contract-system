from pydantic import BaseModel
from datetime import datetime


class TemplateSetCreate(BaseModel):
    name: str
    employee_type: str
    scenario: str
    description: str = ""
    template_ids: list[int] = []


class TemplateSetUpdate(BaseModel):
    name: str | None = None
    employee_type: str | None = None
    scenario: str | None = None
    description: str | None = None
    template_ids: list[int] | None = None


class TemplateSetItemResponse(BaseModel):
    id: int
    template_id: int
    template_name: str
    sort_order: int


class TemplateSetResponse(BaseModel):
    id: int
    name: str
    employee_type: str
    scenario: str
    description: str
    items: list[TemplateSetItemResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}
