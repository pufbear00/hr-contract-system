"""Generic schemas restored for the employee routes in the source baseline."""
from datetime import datetime
from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    employee_type: str = Field(min_length=1, max_length=50)
    id_number: str | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None
    position: str | None = None
    department: str | None = None
    entry_date: str | None = None
    status: str = "在职"
    data: dict = Field(default_factory=dict)


class EmployeeUpdate(BaseModel):
    name: str | None = None
    employee_type: str | None = None
    id_number: str | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None
    position: str | None = None
    department: str | None = None
    entry_date: str | None = None
    status: str | None = None
    data: dict | None = None


class EmployeeResponse(EmployeeCreate):
    id: int
    created_at: datetime
    updated_at: datetime | None = None
    model_config = {"from_attributes": True}


class EmployeeGenerateRequest(BaseModel):
    template_set_id: int
    company_id: int | None = None
    extra_values: dict[str, str] = Field(default_factory=dict)
    save_back: bool = False
