from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class TemplateSet(Base):
    __tablename__ = "template_sets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    employee_type = Column(String(50), nullable=False)  # 正式员工 / 实习生
    scenario = Column(String(50), nullable=False)  # 入职 / 离职
    description = Column(String(500), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    items = relationship("TemplateSetItem", back_populates="template_set", cascade="all, delete-orphan",
                         order_by="TemplateSetItem.sort_order")


class TemplateSetItem(Base):
    __tablename__ = "template_set_items"

    id = Column(Integer, primary_key=True, index=True)
    template_set_id = Column(Integer, ForeignKey("template_sets.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(Integer, ForeignKey("contract_templates.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, default=0)

    template_set = relationship("TemplateSet", back_populates="items")
    template = relationship("ContractTemplate")
