"""数据导出/导入 API：ZIP 打包所有业务数据和模板文件。"""
import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.company import Company
from app.models.employee import Employee
from app.models.social_wage import SocialAverageWage
from app.models.template import ContractTemplate
from app.models.template_set import TemplateSet, TemplateSetItem
from app.models.user import User

router = APIRouter(prefix="/api/v1/data", tags=["data-transfer"])


def _row_to_dict(row, exclude=("id", "created_at", "updated_at")):
    """SQLAlchemy row → dict，保留 _export_id 用于关联映射。"""
    d = {}
    for c in row.__table__.columns:
        val = getattr(row, c.name)
        if c.name == "id":
            d["_export_id"] = val
        if c.name in exclude:
            continue
        if isinstance(val, datetime):
            d[c.name] = val.isoformat()
        else:
            d[c.name] = val
    return d


@router.get("/stats")
async def data_stats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    counts = {}
    for model, key in [
        (Employee, "employees"),
        (Company, "companies"),
        (ContractTemplate, "contract_templates"),
        (TemplateSet, "template_sets"),
        (TemplateSetItem, "template_set_items"),
        (SocialAverageWage, "social_average_wages"),
    ]:
        result = await db.execute(select(func.count()).select_from(model))
        counts[key] = result.scalar()
    return counts


@router.get("/export")
async def export_data(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    # 查询所有数据
    employees = (await db.execute(select(Employee))).scalars().all()
    companies = (await db.execute(select(Company))).scalars().all()
    templates = (await db.execute(select(ContractTemplate))).scalars().all()
    template_sets = (await db.execute(select(TemplateSet))).scalars().all()
    template_set_items = (await db.execute(select(TemplateSetItem))).scalars().all()
    social_wages = (await db.execute(select(SocialAverageWage))).scalars().all()

    # 序列化
    data = {
        "employees": [_row_to_dict(r) for r in employees],
        "companies": [_row_to_dict(r) for r in companies],
        "contract_templates": [_row_to_dict(r, exclude=("id", "created_at", "updated_at")) for r in templates],
        "template_sets": [_row_to_dict(r, exclude=("id", "created_at", "updated_at")) for r in template_sets],
        "template_set_items": [
            {"_export_id": item.id, "template_set_id": item.template_set_id,
             "template_id": item.template_id, "sort_order": item.sort_order}
            for item in template_set_items
        ],
        "social_average_wages": [_row_to_dict(r, exclude=("id", "created_at")) for r in social_wages],
    }

    manifest = {
        "version": "1.0",
        "exported_at": datetime.now().isoformat(),
        "stats": {k: len(v) for k, v in data.items()},
    }

    # 创建 ZIP
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for name, records in data.items():
            zf.writestr(f"data/{name}.json", json.dumps(records, ensure_ascii=False, indent=2))

        # 打包模板 .docx 文件
        for tmpl in templates:
            abs_path = Path(tmpl.file_path)
            if not abs_path.is_absolute():
                abs_path = settings.UPLOAD_DIR / tmpl.file_path
            if abs_path.exists():
                arcname = f"templates/{abs_path.name}"
                zf.write(abs_path, arcname)

    buf.seek(0)
    filename = f"hr-export-{datetime.now().strftime('%Y%m%d%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    strategy: str = Query("skip", regex="^(skip|update)$"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    raise HTTPException(503, "空数据离线版已禁用备份恢复，避免重新导入真实资料；请手动创建虚构演示记录。")

    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(400, "请上传 .zip 文件")

    tmp_dir = tempfile.mkdtemp()
    try:
        # 解压
        content = await file.read()
        zip_path = os.path.join(tmp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            f.write(content)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        data_dir = os.path.join(tmp_dir, "data")
        templates_dir = os.path.join(tmp_dir, "templates")

        def load_json(name: str) -> list:
            p = os.path.join(data_dir, f"{name}.json")
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            return []

        report = {}

        # --- 1. Companies ---
        company_id_map = {}  # old_id → new_id
        companies_data = load_json("companies")
        created = skipped = updated = 0
        for item in companies_data:
            export_id = item.pop("_export_id", None)
            result = await db.execute(
                select(Company).where(Company.company_name == item["company_name"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                if strategy == "update":
                    for k, v in item.items():
                        if k not in ("created_at", "updated_at"):
                            setattr(existing, k, v)
                    updated += 1
                    if export_id is not None:
                        company_id_map[export_id] = existing.id
                else:
                    skipped += 1
                    if export_id is not None:
                        company_id_map[export_id] = existing.id
            else:
                obj = Company(**{k: v for k, v in item.items() if k not in ("created_at", "updated_at")})
                db.add(obj)
                await db.flush()
                created += 1
                if export_id is not None:
                    company_id_map[export_id] = obj.id
        report["companies"] = {"created": created, "skipped": skipped, "updated": updated}

        # --- 2. Employees ---
        employees_data = load_json("employees")
        created = skipped = updated = 0
        for item in employees_data:
            item.pop("_export_id", None)
            result = await db.execute(
                select(Employee).where(
                    Employee.name == item["name"],
                    Employee.id_number == item.get("id_number"),
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                if strategy == "update":
                    for k, v in item.items():
                        if k not in ("created_at", "updated_at"):
                            setattr(existing, k, v)
                    updated += 1
                else:
                    skipped += 1
            else:
                obj = Employee(**{k: v for k, v in item.items() if k not in ("created_at", "updated_at")})
                db.add(obj)
                created += 1
        report["employees"] = {"created": created, "skipped": skipped, "updated": updated}

        # --- 3. Social Wages ---
        wages_data = load_json("social_average_wages")
        created = skipped = updated = 0
        for item in wages_data:
            item.pop("_export_id", None)
            result = await db.execute(
                select(SocialAverageWage).where(
                    SocialAverageWage.year == item["year"],
                    SocialAverageWage.city == item.get("city", ""),
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                if strategy == "update":
                    for k, v in item.items():
                        if k not in ("created_at",):
                            setattr(existing, k, v)
                    updated += 1
                else:
                    skipped += 1
            else:
                obj = SocialAverageWage(**{k: v for k, v in item.items() if k not in ("created_at",)})
                db.add(obj)
                created += 1
        report["social_average_wages"] = {"created": created, "skipped": skipped, "updated": updated}

        # --- 4. Contract Templates ---
        template_id_map = {}  # old_id → new_id
        templates_data = load_json("contract_templates")
        created = skipped = updated = 0
        for item in templates_data:
            export_id = item.pop("_export_id", None)
            result = await db.execute(
                select(ContractTemplate).where(
                    ContractTemplate.name == item["name"],
                    ContractTemplate.original_filename == item["original_filename"],
                )
            )
            existing = result.scalar_one_or_none()

            # 复制模板文件到 uploads 目录
            src_file = os.path.join(templates_dir, os.path.basename(item.get("file_path", "")))
            if not os.path.exists(src_file):
                # 尝试用 original_filename
                src_file = os.path.join(templates_dir, item["original_filename"])

            if existing:
                if strategy == "update":
                    for k, v in item.items():
                        if k not in ("created_at", "updated_at", "file_path"):
                            setattr(existing, k, v)
                    # 覆盖文件
                    if os.path.exists(src_file):
                        dest = Path(existing.file_path)
                        if not dest.is_absolute():
                            dest = settings.UPLOAD_DIR / existing.file_path
                        shutil.copy2(src_file, dest)
                    updated += 1
                else:
                    skipped += 1
                if export_id is not None:
                    template_id_map[export_id] = existing.id
            else:
                # 新建：复制文件到 uploads
                if os.path.exists(src_file):
                    dest_name = os.path.basename(src_file)
                    dest_path = settings.UPLOAD_DIR / dest_name
                    # 避免同名覆盖
                    counter = 1
                    while dest_path.exists():
                        stem, ext = os.path.splitext(dest_name)
                        dest_path = settings.UPLOAD_DIR / f"{stem}_{counter}{ext}"
                        counter += 1
                    shutil.copy2(src_file, dest_path)
                    item["file_path"] = str(dest_path)
                obj = ContractTemplate(**{k: v for k, v in item.items() if k not in ("created_at", "updated_at")})
                db.add(obj)
                await db.flush()
                created += 1
                if export_id is not None:
                    template_id_map[export_id] = obj.id
        report["contract_templates"] = {"created": created, "skipped": skipped, "updated": updated}

        # --- 5. Template Sets ---
        ts_id_map = {}  # old_id → new_id
        ts_data = load_json("template_sets")
        created = skipped = updated = 0
        for item in ts_data:
            export_id = item.pop("_export_id", None)
            result = await db.execute(
                select(TemplateSet).where(
                    TemplateSet.name == item["name"],
                    TemplateSet.employee_type == item["employee_type"],
                    TemplateSet.scenario == item["scenario"],
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                if strategy == "update":
                    for k, v in item.items():
                        if k not in ("created_at", "updated_at"):
                            setattr(existing, k, v)
                    updated += 1
                else:
                    skipped += 1
                if export_id is not None:
                    ts_id_map[export_id] = existing.id
            else:
                obj = TemplateSet(**{k: v for k, v in item.items() if k not in ("created_at", "updated_at")})
                db.add(obj)
                await db.flush()
                created += 1
                if export_id is not None:
                    ts_id_map[export_id] = obj.id
        report["template_sets"] = {"created": created, "skipped": skipped, "updated": updated}

        # --- 6. Template Set Items ---
        tsi_data = load_json("template_set_items")
        created = skipped = 0
        for item in tsi_data:
            item.pop("_export_id", None)
            old_ts_id = item["template_set_id"]
            old_tmpl_id = item["template_id"]
            new_ts_id = ts_id_map.get(old_ts_id)
            new_tmpl_id = template_id_map.get(old_tmpl_id)
            if new_ts_id is None or new_tmpl_id is None:
                skipped += 1
                continue
            # 检查是否已存在
            result = await db.execute(
                select(TemplateSetItem).where(
                    TemplateSetItem.template_set_id == new_ts_id,
                    TemplateSetItem.template_id == new_tmpl_id,
                )
            )
            if result.scalar_one_or_none():
                skipped += 1
                continue
            obj = TemplateSetItem(
                template_set_id=new_ts_id,
                template_id=new_tmpl_id,
                sort_order=item.get("sort_order", 0),
            )
            db.add(obj)
            created += 1
        report["template_set_items"] = {"created": created, "skipped": skipped, "updated": 0}

        await db.commit()
        return {"status": "success", "report": report}

    except zipfile.BadZipFile:
        raise HTTPException(400, "无效的 ZIP 文件")
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"导入失败: {str(e)}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
