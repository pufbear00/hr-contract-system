"""Create a fresh local login only; never seed employees, companies or templates."""
import argparse
import asyncio
import getpass

from sqlalchemy import select
from app.main import app  # Imports all model definitions; does not run lifespan.
from app.database import Base, engine, async_session
from app.models.user import User
from app.auth import hash_password


async def create_admin(username: str, password: str):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        if (await session.execute(select(User.id).limit(1))).scalar_one_or_none():
            raise SystemExit("已有本地账号，初始化未修改任何账号。")
        session.add(User(username=username, password_hash=hash_password(password),
                         display_name="本地演示管理员", role="admin"))
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True, help="新建本地账号名，非原系统账号")
    args = parser.parse_args()
    if not args.username.strip() or len(args.username) > 50:
        raise SystemExit("账号名应为 1–50 个字符。")
    password = getpass.getpass("设置新的演示密码（不显示）：")
    if len(password) < 12 or len(password.encode("utf-8")) > 72:
        raise SystemExit("密码至少 12 个字符，且 UTF-8 编码不超过 72 字节。")
    if password != getpass.getpass("再次输入："):
        raise SystemExit("两次密码不一致，未创建账号。")
    asyncio.run(create_admin(args.username.strip(), password))
    print("本地演示账号已创建；业务表仍为空。")
