"""调度精灵 V8 — FastAPI 后端入口"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from models import User
from auth import hash_password
from routers import auth, ships, blackboard, workflow, users


def seed_users():
    """初始化预置用户（兼容V7账号体系）"""
    db = SessionLocal()
    try:
        existing = db.query(User).count()
        if existing > 0:
            return

        preset = [
            ('admin', 'admin888', 'admin'),
            ('姜磊', None, 'admin'),
            ('王剑峰', None, 'admin'),
            ('杨华', None, 'admin'),
            ('韩韦', 'hanwei888', 'leader'),
            ('冯磊', None, 'dispatcher'),
            ('赵逢时', None, 'dispatcher'),
            ('丁思樑', None, 'dispatcher'),
            ('肖明', None, 'dispatcher'),
            ('沈正阳', None, 'dispatcher'),
            ('聂铭辰', None, 'dispatcher'),
            ('索翼', 'suoyi888', 'dispatcher'),
            ('李诗年', 'lishinian888', 'dispatcher'),
        ]

        for username, pwd, role in preset:
            if pwd is None:
                pwd = username + '888'  # 初始密码：用户名+888，首次登录后应修改
            user = User(
                username=username,
                password_hash=hash_password(pwd),
                role=role
            )
            db.add(user)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_users()
    yield


app = FastAPI(
    title='调度精灵 DispatchHub V8',
    description='上海港船舶调度协作平台 — REST API',
    version='8.0.0',
    lifespan=lifespan,
)

# CORS: allow_credentials=True 时不能用 '*'，用具体 origin 或允许所有 origin 但不传 credentials 的场景
cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_origins != ['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth.router)
app.include_router(ships.router)
app.include_router(blackboard.router)
app.include_router(workflow.router)
app.include_router(users.router)


@app.get('/api/health')
def health():
    return {'status': 'ok', 'version': '8.0.0'}
