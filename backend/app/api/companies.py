from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])

# 公司固定字段 → 模板变量的映射
COMPANY_TO_TEMPLATE = {
    "company_name": "company_name",
    "company_name_en": "company_name_en",
    "legal_representative": "legal_representative",
    "address": "company_address",
    "postal_code": "postal_code",
    "sign_city": "sign_city",
    "work_city": "work_city",
}


def company_to_template_values(company: Company) -> dict[str, str]:
    """从公司档案提取所有可用的模板变量值。"""
    values = {}
    for field, tpl_var in COMPANY_TO_TEMPLATE.items():
        val = getattr(company, field, None)
        if val is not None and val != "":
            values[tpl_var] = str(val)
    if company.data:
        for k, v in company.data.items():
            if v is not None and v != "":
                values[k] = str(v)
    return values


async def get_company_values(company_id: int | None, db: AsyncSession) -> dict[str, str]:
    """获取公司模板变量值。指定 company_id 则用该公司，否则用默认公司。"""
    if company_id:
        result = await db.execute(select(Company).where(Company.id == company_id))
        company = result.scalar_one_or_none()
        if company:
            return company_to_template_values(company)
    else:
        result = await db.execute(select(Company).where(Company.is_default == 1).limit(1))
        company = result.scalar_one_or_none()
        if company:
            return company_to_template_values(company)
    return {}


async def _clear_default(db: AsyncSession):
    """清除所有公司的默认标记。"""
    result = await db.execute(select(Company).where(Company.is_default == 1))
    for c in result.scalars().all():
        c.is_default = 0


@router.post("", response_model=CompanyResponse)
async def create_company(
    body: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.is_default:
        await _clear_default(db)
    company = Company(**body.model_dump())
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.get("", response_model=list[CompanyResponse])
async def list_companies(
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Company).order_by(Company.is_default.desc(), Company.id.desc())
    if search:
        query = query.where(Company.company_name.contains(search))
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    return company


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    update_data = body.model_dump(exclude_unset=True)
    if update_data.get("is_default"):
        await _clear_default(db)
    for key, value in update_data.items():
        setattr(company, key, value)
    await db.commit()
    await db.refresh(company)
    return company


@router.delete("/{company_id}")
async def delete_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="公司不存在")
    await db.delete(company)
    await db.commit()
    return {"message": "删除成功"}
