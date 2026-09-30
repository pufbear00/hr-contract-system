from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String(20), nullable=False)  # single / batch
    status = Column(String(20), nullable=False, default="pending")  # pending / processing / completed / failed
    template_set_id = Column(Integer, ForeignKey("template_sets.id"), nullable=True)
    employee_type = Column(String(50))
    scenario = Column(String(50))
    zip_file_path = Column(String(500), nullable=True)
    employee_count = Column(Integer, default=0)
    document_count = Column(Integer, default=0)
    error_message = Column(String(1000), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    documents = relationship("GeneratedDocument", back_populates="job", cascade="all, delete-orphan")
    creator = relationship("User")


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("generation_jobs.id", ondelete="CASCADE"), nullable=False)
    employee_name = Column(String(100), nullable=False)
    template_name = Column(String(200), nullable=False)
    filled_values = Column(JSON, nullable=False, default=dict)
    file_path = Column(String(500), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    job = relationship("GenerationJob", back_populates="documents")
