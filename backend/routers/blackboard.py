"""调度黑板路由 — 消息CRUD"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import BlackboardMessage, User, utc_now_ms
from auth import get_current_user

router = APIRouter(prefix='/api/blackboard', tags=['调度黑板'])


class MessageIn(BaseModel):
    date: str
    message: str


@router.get('')
def list_messages(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """按日期获取消息"""
    if date:
        msgs = db.query(BlackboardMessage).filter(
            BlackboardMessage.date == date
        ).order_by(BlackboardMessage.ts).all()
    else:
        msgs = db.query(BlackboardMessage).order_by(BlackboardMessage.ts.desc()).limit(200).all()
    return [m.serialize for m in msgs]


@router.post('')
def send_message(
    data: MessageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """发送消息"""
    if not data.message.strip():
        raise HTTPException(status_code=400, detail='消息不能为空')
    msg = BlackboardMessage(
        date=data.date,
        author=current_user.username,
        role=current_user.role,
        message=data.message.strip(),
        ts=utc_now_ms()
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg.serialize


@router.delete('/{msg_id}')
def delete_message(
    msg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除消息（作者或管理员可删除）"""
    msg = db.query(BlackboardMessage).filter(BlackboardMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail='消息不存在')
    if current_user.role != 'admin' and msg.author != current_user.username:
        raise HTTPException(status_code=403, detail='只能删除自己的消息')
    db.delete(msg)
    db.commit()
    return {'ok': True}
