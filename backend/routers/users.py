"""用户管理路由（仅admin可操作）"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User, utc_now_ms
from auth import hash_password, get_current_user, require_admin

router = APIRouter(prefix='/api/users', tags=['用户管理'])


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = 'dispatcher'


class UpdateRoleRequest(BaseModel):
    role: str


class ResetPasswordRequest(BaseModel):
    password: str


@router.get('')
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    users = db.query(User).order_by(User.username).all()
    return [u.serialize for u in users]


@router.post('')
def create_user(
    req: CreateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
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


@router.put('/{username}/role')
def update_role(
    username: str,
    req: UpdateRoleRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if req.role not in ('admin', 'leader', 'dispatcher'):
        raise HTTPException(status_code=400, detail='无效角色')
    if username == 'admin':
        raise HTTPException(status_code=400, detail='不能修改admin角色')

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    user.role = req.role
    db.commit()
    return {'ok': True, 'username': username, 'role': req.role}


@router.put('/{username}/password')
def reset_password(
    username: str,
    req: ResetPasswordRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail='密码至少4位')

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    user.password_hash = hash_password(req.password)
    db.commit()
    return {'ok': True, 'username': username}


@router.delete('/{username}')
def delete_user(
    username: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if username == 'admin':
        raise HTTPException(status_code=400, detail='不能删除admin账号')
    if username == admin.username:
        raise HTTPException(status_code=400, detail='不能删除自己')

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    db.delete(user)
    db.commit()
    return {'ok': True}
