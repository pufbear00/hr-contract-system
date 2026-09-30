import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.auth import get_current_user
from app.config import settings as app_settings
from app.models.user import User
from app.models.template import ContractTemplate
from app.models.template_set import TemplateSet, TemplateSetItem
from app.models.generation import GenerationJob, GeneratedDocument
from app.models.social_wage import SocialAverageWage
from app.schemas.generate import (
    SingleGenerateRequest, BatchPreviewResponse, BatchPreviewRow,
    BatchGenerateRequest, MergedVariablesResponse, VariableInfo, JobResponse,
)
from app.services.doc_generator import generate_zip_for_employee, create_zip
from app.services.batch_processor import parse_excel
from app.api.companies import get_company_values
from app.config import settings

router = APIRouter(prefix="/api/v1/generate", tags=["generate"])


async def _get_template_set_with_templates(
    template_set_id: int, db: AsyncSession
) -> tuple[TemplateSet, list[ContractTemplate]]:
    result = await db.execute(
        select(TemplateSet)
        .options(selectinload(TemplateSet.items).selectinload(TemplateSetItem.template))
        .where(TemplateSet.id == template_set_id)
    )
    ts = result.scalar_one_or_none()
    if not ts:
        raise HTTPException(status_code=404, detail="模板集合不存在")

    templates = [item.template for item in ts.items if item.template]
    if not templates:
        raise HTTPException(status_code=400, detail="模板集合中没有模板")
    return ts, templates


def _merge_variables(templates: list[ContractTemplate]) -> list[VariableInfo]:
    """Merge variables from multiple templates, deduplicating by key."""
    seen = {}
    for tpl in templates:
        schema = tpl.variable_schema or {}
        for var in tpl.variables:
            if var not in seen:
                field = schema.get(var, {})
                seen[var] = VariableInfo(
                    key=var,
                    label=field.get("label", var),
                    type=field.get("type", "text"),
                    required=field.get("required", True),
                    options=field.get("options", []),
                )
    return list(seen.values())


@router.get("/variables", response_model=MergedVariablesResponse)
async def get_merged_variables(
    template_set_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ts, templates = await _get_template_set_with_templates(template_set_id, db)
    variables = _merge_variables(templates)
    return MergedVariablesResponse(
        template_set_id=ts.id,
        template_set_name=ts.name,
        variables=variables,
    )


@router.post("/single")
async def generate_single(
    body: SingleGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ts, templates = await _get_template_set_with_templates(body.template_set_id, db)

    # 查询社平工资上限
    wage_result = await db.execute(
        select(SocialAverageWage).order_by(SocialAverageWage.year.desc()).limit(1)
    )
    wage_row = wage_result.scalar_one_or_none()
    monthly_cap = round(wage_row.annual_amount / 12 * 3, 2) if wage_row else None

    # 合并公司值（公司值作为底层，用户提交的 values 覆盖）
    company_values = await get_company_values(body.company_id, db)
    if company_values:
        body.values = {**company_values, **body.values}

    employee_name = body.values.get("employee_name", body.values.get("姓名", "未知"))

    # Create job
    job = GenerationJob(
        job_type="single",
        status="processing",
        template_set_id=ts.id,
        employee_type=ts.employee_type,
        scenario=ts.scenario,
        employee_count=1,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    # Generate documents
    job_dir = settings.GENERATED_DIR / f"job_{job.id}"
    tpl_list = [{"name": t.name, "path": t.file_path} for t in templates]

    try:
        saved_files = generate_zip_for_employee(employee_name, tpl_list, body.values, job_dir, monthly_cap=monthly_cap)
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")

    # Create ZIP
    zip_path = settings.GENERATED_DIR / f"job_{job.id}.zip"
    create_zip(job_dir, zip_path)

    job.status = "completed"
    job.zip_file_path = str(zip_path)
    job.document_count = len(saved_files)

    for sf in saved_files:
        doc = GeneratedDocument(
            job_id=job.id,
            employee_name=employee_name,
            template_name=sf.stem,
            filled_values=body.values,
            file_path=str(sf),
        )
        db.add(doc)

    await db.commit()
    return {"job_id": job.id, "message": "生成成功", "document_count": len(saved_files)}


@router.post("/batch-upload", response_model=BatchPreviewResponse)
async def batch_upload(
    template_set_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="仅支持 Excel 文件")

    content = await file.read()
    try:
        headers, rows = parse_excel(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"解析 Excel 失败: {str(e)}")

    preview_rows = []
    for idx, row in enumerate(rows):
        name = row.get("employee_name", row.get("姓名", f"员工{idx + 1}"))
        preview_rows.append(BatchPreviewRow(row_number=idx + 1, employee_name=name, values=row))

    return BatchPreviewResponse(
        template_set_id=template_set_id,
        columns=headers,
        rows=preview_rows,
        total=len(preview_rows),
    )


@router.post("/batch")
async def generate_batch(
    body: BatchGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ts, templates = await _get_template_set_with_templates(body.template_set_id, db)

    wage_result = await db.execute(
        select(SocialAverageWage).order_by(SocialAverageWage.year.desc()).limit(1)
    )
    wage_row = wage_result.scalar_one_or_none()
    monthly_cap = round(wage_row.annual_amount / 12 * 3, 2) if wage_row else None

    job = GenerationJob(
        job_type="batch",
        status="processing",
        template_set_id=ts.id,
        employee_type=ts.employee_type,
        scenario=ts.scenario,
        employee_count=len(body.rows),
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    # 合并公司值
    company_values = await get_company_values(body.company_id, db)

    job_dir = settings.GENERATED_DIR / f"job_{job.id}"
    tpl_list = [{"name": t.name, "path": t.file_path} for t in templates]
    total_docs = 0

    try:
        for row in body.rows:
            merged_row = {**company_values, **row} if company_values else row
            employee_name = merged_row.get("employee_name", merged_row.get("姓名", "未知"))
            saved_files = generate_zip_for_employee(employee_name, tpl_list, merged_row, job_dir, monthly_cap=monthly_cap)
            total_docs += len(saved_files)

            for sf in saved_files:
                doc = GeneratedDocument(
                    job_id=job.id,
                    employee_name=employee_name,
                    template_name=sf.stem,
                    filled_values=merged_row,
                    file_path=str(sf),
                )
                db.add(doc)
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"批量生成失败: {str(e)}")

    zip_path = settings.GENERATED_DIR / f"job_{job.id}.zip"
    create_zip(job_dir, zip_path)

    job.status = "completed"
    job.zip_file_path = str(zip_path)
    job.document_count = total_docs
    await db.commit()

    return {"job_id": job.id, "message": "批量生成成功", "employee_count": len(body.rows), "document_count": total_docs}


@router.get("/download/{job_id}")
async def download_zip(
    job_id: int,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Verify token from query param (for browser downloads)
    if not token:
        raise HTTPException(status_code=401, detail="需要认证")
    try:
        jwt.decode(token, app_settings.SECRET_KEY, algorithms=[app_settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的 token")

    result = await db.execute(select(GenerationJob).where(GenerationJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    if not job.zip_file_path or not Path(job.zip_file_path).exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        job.zip_file_path,
        media_type="application/zip",
        filename=f"合同_{job.employee_type}_{job.scenario}_{job.id}.zip",
    )


@router.get("/jobs", response_model=list[JobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GenerationJob)
        .options(selectinload(GenerationJob.creator))
        .order_by(GenerationJob.id.desc())
    )
    jobs = result.scalars().all()
    response = []
    for j in jobs:
        resp = JobResponse(
            id=j.id,
            job_type=j.job_type,
            status=j.status,
            employee_type=j.employee_type,
            scenario=j.scenario,
            employee_count=j.employee_count,
            document_count=j.document_count,
            error_message=j.error_message,
            created_by_name=j.creator.display_name if j.creator else "",
            created_at=j.created_at,
        )
        response.append(resp)
    return response
