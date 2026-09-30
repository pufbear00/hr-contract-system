"""社平工资管理 + 补偿金额计算 API。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.social_wage import SocialAverageWage
from app.services.value_enrichment import _parse_chinese_date, calculate_compensation

router = APIRouter(prefix="/api/v1/social-wages", tags=["social-wages"])


class SocialWageCreate(BaseModel):
    year: int
    annual_amount: float
    city: str


class SocialWageResponse(BaseModel):
    id: int
    year: int
    annual_amount: float
    monthly_cap: float  # 月均3倍上限
    city: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[SocialWageResponse])
async def list_social_wages(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocialAverageWage).order_by(SocialAverageWage.year.desc())
    )
    rows = result.scalars().all()
    return [
        SocialWageResponse(
            id=r.id,
            year=r.year,
            annual_amount=r.annual_amount,
            monthly_cap=round(r.annual_amount / 12 * 3, 1),
            city=r.city,
        )
        for r in rows
    ]


@router.post("", response_model=SocialWageResponse)
async def create_social_wage(
    body: SocialWageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 检查年份是否已存在
    result = await db.execute(
        select(SocialAverageWage).where(SocialAverageWage.year == body.year)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"{body.year}年数据已存在")

    row = SocialAverageWage(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return SocialWageResponse(
        id=row.id,
        year=row.year,
        annual_amount=row.annual_amount,
        monthly_cap=round(row.annual_amount / 12 * 3, 1),
        city=row.city,
    )


@router.put("/{wage_id}", response_model=SocialWageResponse)
async def update_social_wage(
    wage_id: int,
    body: SocialWageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocialAverageWage).where(SocialAverageWage.id == wage_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="记录不存在")
    row.year = body.year
    row.annual_amount = body.annual_amount
    row.city = body.city
    await db.commit()
    await db.refresh(row)
    return SocialWageResponse(
        id=row.id,
        year=row.year,
        annual_amount=row.annual_amount,
        monthly_cap=round(row.annual_amount / 12 * 3, 1),
        city=row.city,
    )


@router.delete("/{wage_id}")
async def delete_social_wage(
    wage_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SocialAverageWage).where(SocialAverageWage.id == wage_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="记录不存在")
    await db.delete(row)
    await db.commit()
    return {"message": "删除成功"}


@router.get("/latest-cap")
async def get_latest_cap(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取最新年份的社平月均3倍上限。"""
    result = await db.execute(
        select(SocialAverageWage).order_by(SocialAverageWage.year.desc()).limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return {"year": None, "monthly_cap": None}
    return {
        "year": row.year,
        "monthly_cap": round(row.annual_amount / 12 * 3, 1),
    }


@router.get("/calc-compensation")
async def calc_compensation(
    entry_date: str = Query(..., description="入职日期"),
    termination_date: str = Query(..., description="离职日期"),
    base_salary: float = Query(..., description="月薪 base"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """预计算 N+1 补偿金额。"""
    entry_d = _parse_chinese_date(entry_date)
    term_d = _parse_chinese_date(termination_date)
    if not entry_d or not term_d:
        raise HTTPException(status_code=400, detail="日期格式无法解析")

    result = await db.execute(
        select(SocialAverageWage).order_by(SocialAverageWage.year.desc()).limit(1)
    )
    wage_row = result.scalar_one_or_none()
    monthly_cap = round(wage_row.annual_amount / 12 * 3, 2) if wage_row else None

    comp = calculate_compensation(entry_d, term_d, base_salary, monthly_cap)
    comp["monthly_cap"] = monthly_cap
    comp["wage_year"] = wage_row.year if wage_row else None
    return comp
