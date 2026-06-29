"""认证路由 — 登录/注册"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User, utc_now_ms
from auth import (
    hash_password, verify_password, needs_upgrade,
    create_access_token, get_current_user, require_admin
)

router = APIRouter(prefix='/api/auth', tags=['认证'])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = 'dispatcher'


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    username: str
    role: str


@router.post('/login', response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(status_code=401, detail='账号不存在')
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail='密码错误')

    # V7旧格式哈希自动升级到bcrypt
    if needs_upgrade(user.password_hash):
        user.password_hash = hash_password(req.password)
        db.commit()

    token = create_access_token({'sub': user.username, 'role': user.role})
    return TokenResponse(
        access_token=token,
        username=user.username,
        role=user.role
    )


@router.post('/register')
def register(req: RegisterRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if len(req.username) < 2:
        raise HTTPException(status_code=400, detail='账号名至少2个字')
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail='密码至少4位')
    if req.role not in ('admin', 'leader', 'dispatcher'):
        raise HTTPException(status_code=400, detail='无效角色')

    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=409, detail='账号已存在')

    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        role=req.role,
        created_at=utc_now_ms()
    )
    db.add(user)
    db.commit()
    return {'ok': True, 'username': req.username, 'role': req.role}


@router.get('/me')
def me(current_user: User = Depends(get_current_user)):
    return {
        'username': current_user.username,
        'role': current_user.role,
        'created': current_user.created_at
    }
