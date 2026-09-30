import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.template import ContractTemplate
from app.schemas.template import TemplateResponse, TemplateUpdate
from app.services.template_parser import extract_variables, build_default_schema
from app.config import settings

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


@router.post("/upload", response_model=TemplateResponse)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(""),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    filename = Path((file.filename or "").replace("\\", "/")).name
    if not filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="仅支持 .docx 文件")

    # Save file
    file_id = uuid.uuid4().hex[:12]
    save_path = settings.UPLOAD_DIR / f"{file_id}_{filename}"
    content = await file.read()
    save_path.write_bytes(content)

    # Extract variables
    try:
        variables = extract_variables(save_path)
    except Exception as e:
        save_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"解析模板失败: {str(e)}")

    schema = build_default_schema(variables)
    template_name = name or Path(filename).stem

    template = ContractTemplate(
        name=template_name,
        file_path=str(save_path),
        original_filename=filename,
        variables=variables,
        variable_schema=schema,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("", response_model=list[TemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContractTemplate).order_by(ContractTemplate.id.desc()))
    return result.scalars().all()


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContractTemplate).where(ContractTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    body: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContractTemplate).where(ContractTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    if body.name is not None:
        template.name = body.name
    if body.variable_schema is not None:
        template.variable_schema = body.variable_schema

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContractTemplate).where(ContractTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    # Delete file
    file_path = Path(template.file_path)
    file_path.unlink(missing_ok=True)

    await db.delete(template)
    await db.commit()
    return {"message": "已删除"}
