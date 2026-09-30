from sqlalchemy import Column, Integer, String, DateTime, JSON, func
from app.database import Base


class ContractTemplate(Base):
    __tablename__ = "contract_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    file_path = Column(String(500), nullable=False)
    original_filename = Column(String(300), nullable=False)
    variables = Column(JSON, nullable=False, default=list)  # ["employee_name", "id_number", ...]
    variable_schema = Column(JSON, nullable=False, default=dict)
    # schema format: {"employee_name": {"label": "员工姓名", "type": "text", "required": true}, ...}
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
