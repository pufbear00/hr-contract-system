from sqlalchemy import Column, Integer, String, DateTime, JSON, Date, func
from app.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    employee_type = Column(String(50), nullable=False)  # 正式员工 / 实习生
    id_number = Column(String(50), nullable=True)
    gender = Column(String(10), nullable=True)
    phone = Column(String(30), nullable=True)
    address = Column(String(500), nullable=True)
    position = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    entry_date = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="在职")  # 在职 / 已离职
    data = Column(JSON, nullable=False, default=dict)  # 其他模板变量
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
