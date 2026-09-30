from pydantic import BaseModel
from datetime import datetime


class VariableField(BaseModel):
    label: str = ""
    type: str = "text"  # text / date / number / select
    required: bool = True
    options: list[str] = []  # for select type


class TemplateResponse(BaseModel):
    id: int
    name: str
    original_filename: str
    variables: list[str]
    variable_schema: dict[str, VariableField]
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateUpdate(BaseModel):
    name: str | None = None
    variable_schema: dict[str, dict] | None = None
