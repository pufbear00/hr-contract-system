from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.template import ContractTemplate
from app.models.template_set import TemplateSet, TemplateSetItem
from app.schemas.template_set import (
    TemplateSetCreate, TemplateSetUpdate, TemplateSetResponse, TemplateSetItemResponse,
)

router = APIRouter(prefix="/api/v1/template-sets", tags=["template-sets"])


def _build_response(ts: TemplateSet) -> TemplateSetResponse:
    items = []
    for item in ts.items:
        items.append(TemplateSetItemResponse(
            id=item.id,
            template_id=item.template_id,
            template_name=item.template.name if item.template else "",
            sort_order=item.sort_order,
        ))
    return TemplateSetResponse(
        id=ts.id,
        name=ts.name,
        employee_type=ts.employee_type,
        scenario=ts.scenario,
        description=ts.description or "",
        items=items,
        created_at=ts.created_at,
    )


@router.post("", response_model=TemplateSetResponse)
async def create_template_set(
    body: TemplateSetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ts = TemplateSet(
        name=body.name,
        employee_type=body.employee_type,
        scenario=body.scenario,
        description=body.description,
    )
    db.add(ts)
    await db.flush()

    for idx, tid in enumerate(body.template_ids):
        item = TemplateSetItem(template_set_id=ts.id, template_id=tid, sort_order=idx)
        db.add(item)

    await db.commit()

    result = await db.execute(
        select(TemplateSet)
        .options(selectinload(TemplateSet.items).selectinload(TemplateSetItem.template))
        .where(TemplateSet.id == ts.id)
    )
    return _build_response(result.scalar_one())


@router.get("", response_model=list[TemplateSetResponse])
async def list_template_sets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TemplateSet)
        .options(selectinload(TemplateSet.items).selectinload(TemplateSetItem.template))
        .order_by(TemplateSet.id.desc())
    )
    return [_build_response(ts) for ts in result.scalars().all()]


@router.get("/lookup", response_model=TemplateSetResponse)
async def lookup_template_set(
    employee_type: str = Query(...),
    scenario: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TemplateSet)
        .options(selectinload(TemplateSet.items).selectinload(TemplateSetItem.template))
        .where(TemplateSet.employee_type == employee_type, TemplateSet.scenario == scenario)
    )
    ts = result.scalar_one_or_none()
    if not ts:
        raise HTTPException(status_code=404, detail="未找到匹配的模板集合")
    return _build_response(ts)


@router.put("/{set_id}", response_model=TemplateSetResponse)
async def update_template_set(
    set_id: int,
    body: TemplateSetUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TemplateSet)
        .options(selectinload(TemplateSet.items).selectinload(TemplateSetItem.template))
        .where(TemplateSet.id == set_id)
    )
    ts = result.scalar_one_or_none()
    if not ts:
        raise HTTPException(status_code=404, detail="模板集合不存在")

    if body.name is not None:
        ts.name = body.name
    if body.employee_type is not None:
        ts.employee_type = body.employee_type
    if body.scenario is not None:
        ts.scenario = body.scenario
    if body.description is not None:
        ts.description = body.description

    if body.template_ids is not None:
        # Remove old items
        for item in ts.items:
            await db.delete(item)
        await db.flush()
        # Add new items
        for idx, tid in enumerate(body.template_ids):
            item = TemplateSetItem(template_set_id=ts.id, template_id=tid, sort_order=idx)
            db.add(item)

    await db.commit()

    result = await db.execute(
        select(TemplateSet)
        .options(selectinload(TemplateSet.items).selectinload(TemplateSetItem.template))
        .where(TemplateSet.id == set_id)
    )
    return _build_response(result.scalar_one())


@router.delete("/{set_id}")
async def delete_template_set(
    set_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(TemplateSet).where(TemplateSet.id == set_id))
    ts = result.scalar_one_or_none()
    if not ts:
        raise HTTPException(status_code=404, detail="模板集合不存在")
    await db.delete(ts)
    await db.commit()
    return {"message": "已删除"}
