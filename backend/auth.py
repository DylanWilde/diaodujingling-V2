"""JWT鉴权 + 密码哈希"""
import os
import hashlib
import hmac
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from models import User

SECRET_KEY = os.environ.get('JWT_SECRET')
if not SECRET_KEY:
    raise RuntimeError('JWT_SECRET 环境变量未设置，请在 .env 中配置')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 7天

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/auth/login')

# 兼容V7的SHA-256+HMAC哈希（用于迁移）
V7_SALT = 'DispatchHubV6_SecureHashSalt_2026'


def hash_password_v7(password: str) -> str:
    """V7兼容哈希：SHA-256 + HMAC"""
    h = hmac.new(V7_SALT.encode(), password.encode(), hashlib.sha256).hexdigest()
    return 'sha256:' + h


def verify_password_v7(password: str, stored_hash: str) -> bool:
    if not stored_hash.startswith('sha256:'):
        return False
    return hash_password_v7(password) == stored_hash


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, stored_hash: str) -> bool:
    # 先尝试bcrypt
    try:
        if stored_hash.startswith('$2'):
            return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except (ValueError, TypeError):
        pass
    # 再尝试V7兼容哈希
    return verify_password_v7(password, stored_hash)


def needs_upgrade(stored_hash: str) -> bool:
    """V7旧格式哈希需要升级到bcrypt"""
    return stored_hash.startswith('sha256:')


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='无效的登录凭证',
        headers={'WWW-Authenticate': 'Bearer'},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get('sub')
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail='仅管理员可执行此操作')
    return current_user


def require_login(current_user: User = Depends(get_current_user)) -> User:
    return current_user
