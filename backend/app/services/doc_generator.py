import io
import zipfile
import re
from pathlib import Path

from docxtpl import DocxTemplate

from app.config import settings
from app.services.value_enrichment import enrich_values


def _safe_filename(value: str) -> str:
    """User-supplied names must never escape the local job directory."""
    return re.sub(r'[\\/\x00-\x1f<>:"|?*]', '_', str(value)).strip(' .')[:120] or "demo"


def generate_single_document(template_path: str, values: dict, monthly_cap: float | None = None) -> bytes:
    """Fill a single template with values and return the bytes."""
    doc = DocxTemplate(template_path)
    doc.render(enrich_values(values, monthly_cap=monthly_cap))
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def generate_zip_for_employee(
    employee_name: str,
    templates: list[dict],  # [{"name": "劳动合同", "path": "/path/to/file.docx"}, ...]
    values: dict,
    job_dir: Path,
    monthly_cap: float | None = None,
) -> list[Path]:
    """Generate all documents for one employee, return list of saved file paths."""
    employee_dir = job_dir / _safe_filename(employee_name)
    employee_dir.mkdir(parents=True, exist_ok=True)

    enriched = enrich_values(values, monthly_cap=monthly_cap)
    saved_files = []
    for tpl in templates:
        doc = DocxTemplate(tpl["path"])
        doc.render(enriched)
        out_path = employee_dir / f"{_safe_filename(tpl['name'])}.docx"
        doc.save(str(out_path))
        saved_files.append(out_path)
    return saved_files


def create_zip(job_dir: Path, zip_path: Path) -> Path:
    """Create a ZIP file from a job directory."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in job_dir.rglob("*.docx"):
            arcname = file.relative_to(job_dir)
            zf.write(file, arcname)
    return zip_path
