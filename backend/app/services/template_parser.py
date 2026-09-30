from pathlib import Path
from docxtpl import DocxTemplate


def extract_variables(file_path: str | Path) -> list[str]:
    """Extract all undeclared template variables from a .docx file."""
    doc = DocxTemplate(str(file_path))
    variables = doc.get_undeclared_template_variables()
    return sorted(variables)


def build_default_schema(variables: list[str]) -> dict:
    """Build a default variable schema with sensible defaults."""
    schema = {}
    for var in variables:
        field = {"label": var, "type": "text", "required": True, "options": []}
        # Auto-detect common patterns
        lower = var.lower()
        if "date" in lower or "日期" in var:
            field["type"] = "date"
        elif "salary" in lower or "薪" in var or "金额" in var:
            field["type"] = "number"
        schema[var] = field
    return schema
