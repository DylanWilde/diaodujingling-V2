"""流程跟踪路由 — 四阶段Kanban"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import WorkflowRecord, Ship, User, utc_now_iso
from auth import get_current_user

router = APIRouter(prefix='/api/workflow', tags=['流程跟踪'])


class ChannelPassData(BaseModel):
    channel: str  # 南/北
    passTime: str


@router.get('')
def list_workflow(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """按日期获取流程记录"""
    if date:
        records = db.query(WorkflowRecord).filter(
            WorkflowRecord.date == date
        ).order_by(WorkflowRecord.name).all()
    else:
        records = db.query(WorkflowRecord).order_by(WorkflowRecord.date.desc(), WorkflowRecord.name).all()
    return [r.serialize for r in records]


@router.post('/sync/{date}')
def sync_from_ships(
    date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """从当日船期自动同步到流程（去重：船名+iv+ev+日期）"""
    ships = db.query(Ship).filter(Ship.date == date).all()
    if not ships:
        return {'ok': True, 'added': 0}

    # 已有记录去重
    existing = db.query(WorkflowRecord).filter(WorkflowRecord.date == date).all()
    existing_keys = {(w.date, w.name, w.iv, w.ev) for w in existing}

    now_iso = utc_now_iso()
    added = 0
    for s in ships:
        key = (s.date, s.name, s.iv, s.ev)
        if key in existing_keys:
            continue
        wf = WorkflowRecord(
            date=s.date,
            name=s.name,
            en=s.en,
            iv=s.iv,
            ev=s.ev,
            tm=s.tm,
            ar_v=s.ar_v,
            dr_v=s.dr_v,
            ar_raw=s.ar_raw,
            dr_raw=s.dr_raw,
            eta=s.eta,
            pp=s.pp,
            np=s.np,
            schedule_status='done',
            schedule_by='auto',
            schedule_at=now_iso,
            created_at=now_iso,
            updated_at=now_iso
        )
        db.add(wf)
        added += 1

    db.commit()
    return {'ok': True, 'added': added}


@router.put('/{wf_id}/advance/{stage}')
def advance_stage(
    wf_id: int,
    stage: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """推进到下一阶段"""
    STAGE_FIELD = {
        'schedule': 'schedule',
        'pilotage': 'pilotage',
        'singleWindow': 'single_window',
        'channelPass': 'channel_pass',
    }
    valid_stages = set(STAGE_FIELD.keys())
    if stage not in valid_stages:
        raise HTTPException(status_code=400, detail='无效阶段')

    wf = db.query(WorkflowRecord).filter(WorkflowRecord.id == wf_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail='记录不存在')

    field = STAGE_FIELD[stage]
    now_iso = utc_now_iso()
    setattr(wf, f'{field}_status', 'done')
    setattr(wf, f'{field}_by', current_user.username)
    setattr(wf, f'{field}_at', now_iso)
    wf.updated_at = now_iso
    db.commit()
    db.refresh(wf)
    return wf.serialize


@router.put('/{wf_id}/channel-pass')
def confirm_channel_pass(
    wf_id: int,
    data: ChannelPassData,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """走槽确认（填南/北槽+时间）"""
    wf = db.query(WorkflowRecord).filter(WorkflowRecord.id == wf_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail='记录不存在')

    now_iso = utc_now_iso()
    wf.channel_pass_status = 'done'
    wf.channel_pass_by = current_user.username
    wf.channel_pass_at = now_iso
    wf.channel = data.channel
    wf.pass_time = data.passTime
    wf.updated_at = now_iso
    db.commit()
    db.refresh(wf)
    return wf.serialize


@router.delete('/{wf_id}')
def delete_workflow(
    wf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    wf = db.query(WorkflowRecord).filter(WorkflowRecord.id == wf_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail='记录不存在')
    db.delete(wf)
    db.commit()
    return {'ok': True}
