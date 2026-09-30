from pydantic import BaseModel
from datetime import datetime


class SingleGenerateRequest(BaseModel):
    template_set_id: int
    company_id: int | None = None
    values: dict[str, str]


class BatchPreviewRow(BaseModel):
    row_number: int
    employee_name: str
    values: dict[str, str]


class BatchPreviewResponse(BaseModel):
    template_set_id: int
    columns: list[str]
    rows: list[BatchPreviewRow]
    total: int


class BatchGenerateRequest(BaseModel):
    template_set_id: int
    company_id: int | None = None
    rows: list[dict[str, str]]


class VariableInfo(BaseModel):
    key: str
    label: str
    type: str
    required: bool
    options: list[str] = []


class MergedVariablesResponse(BaseModel):
    template_set_id: int
    template_set_name: str
    variables: list[VariableInfo]


class JobResponse(BaseModel):
    id: int
    job_type: str
    status: str
    employee_type: str | None
    scenario: str | None
    employee_count: int
    document_count: int
    error_message: str | None
    created_by_name: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}
