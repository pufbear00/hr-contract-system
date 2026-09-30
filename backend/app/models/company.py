from sqlalchemy import Column, Integer, String, DateTime, JSON, func

from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(200), nullable=False)
    company_name_en = Column(String(200), nullable=True)
    legal_representative = Column(String(100), nullable=True)
    address = Column(String(500), nullable=True)
    postal_code = Column(String(20), nullable=True)
    sign_city = Column(String(50), nullable=True)
    work_city = Column(String(50), nullable=True)
    is_default = Column(Integer, nullable=False, default=0)
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
