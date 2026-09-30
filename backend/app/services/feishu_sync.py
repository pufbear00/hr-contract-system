"""The independent empty-data copy never connects to a live HR tenant."""
from fastapi import HTTPException


async def sync_employees(db):
    raise HTTPException(
        status_code=503,
        detail="空数据离线版已禁用飞书同步；不会读取或回写真实员工资料。",
    )
