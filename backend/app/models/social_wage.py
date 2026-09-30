from sqlalchemy import Column, Integer, Float, String, DateTime, func
from app.database import Base


class SocialAverageWage(Base):
    __tablename__ = "social_average_wages"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, unique=True)
    annual_amount = Column(Float, nullable=False, comment="年平均工资(元)")
    city = Column(String(50), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
