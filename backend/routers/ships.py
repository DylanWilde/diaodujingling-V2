"""船舶数据路由 — CRUD + 批量导入/导出"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Ship, User, utc_now_ms
from auth import get_current_user, require_login

router = APIRouter(prefix='/api/ships', tags=['船舶数据'])


class ShipIn(BaseModel):
    date: str
    name: str
    en: str = ''
    iv: str = ''
    ev: str = ''
    tm: str = ''
    arRaw: str = ''
    arV: Optional[float] = None
    drRaw: str = ''
    drV: Optional[float] = None
    pp: str = '—'
    np: str = '—'
    rm: str = '—'
    eta: str = ''
    _m: bool = False
    maritime7: bool = False
    maritime7Note: str = ''
    maritime7By: str = ''
    bizType: str = ''


class ShipUpdate(BaseModel):
    name: Optional[str] = None
    en: Optional[str] = None
    iv: Optional[str] = None
    ev: Optional[str] = None
    tm: Optional[str] = None
    arRaw: Optional[str] = None
    arV: Optional[float] = None
    drRaw: Optional[str] = None
    drV: Optional[float] = None
    pp: Optional[str] = None
    np: Optional[str] = None
    rm: Optional[str] = None
    eta: Optional[str] = None
    _m: Optional[bool] = None
    maritime7: Optional[bool] = None
    maritime7Note: Optional[str] = None
    maritime7By: Optional[str] = None
    bizType: Optional[str] = None


class MaritimeDeclUpdate(BaseModel):
    maritime7: bool
    maritime7Note: str = ''
    maritime7By: str = ''


@router.get('')
def list_ships(
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=10, le=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """按日期查询船舶，无参数则返回全部（分页）"""
    query = db.query(Ship)
    if date:
        query = query.filter(Ship.date == date).order_by(Ship.name)
    else:
        query = query.order_by(Ship.date.desc(), Ship.name)
    total = query.count()
    ships = query.offset((page - 1) * page_size).limit(page_size).all()
    return {'data': [s.serialize for s in ships], 'total': total, 'page': page, 'page_size': page_size}


@router.get('/dates')
def list_dates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """列出所有有数据的日期"""
    dates = db.query(Ship.date).distinct().order_by(Ship.date.desc()).all()
    return [d[0] for d in dates]


@router.get('/{ship_id}')
def get_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail='船舶不存在')
    return ship.serialize


@router.post('')
def create_ship(
    data: ShipIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ship = Ship(
        date=data.date,
        name=data.name,
        en=data.en,
        iv=data.iv,
        ev=data.ev,
        tm=data.tm,
        ar_raw=data.arRaw,
        ar_v=data.arV,
        dr_raw=data.drRaw,
        dr_v=data.drV,
        pp=data.pp,
        np=data.np,
        rm=data.rm,
        eta=data.eta,
        _m=1 if data._m else 0,
        maritime7=1 if data.maritime7 else 0,
        maritime7_note=data.maritime7Note,
        maritime7_by=data.maritime7By,
        biz_type=data.bizType,
        updated_at=utc_now_ms()
    )
    db.add(ship)
    db.commit()
    db.refresh(ship)
    return ship.serialize


@router.put('/{ship_id}')
def update_ship(
    ship_id: int,
    data: ShipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail='船舶不存在')

    update_data = data.model_dump(exclude_unset=True)
    field_map = {
        'arRaw': 'ar_raw', 'arV': 'ar_v',
        'drRaw': 'dr_raw', 'drV': 'dr_v',
        'maritime7Note': 'maritime7_note', 'maritime7By': 'maritime7_by',
        'bizType': 'biz_type',
    }
    unrecognized = []
    for k, v in update_data.items():
        db_key = field_map.get(k, k)
        if not hasattr(ship, db_key) and db_key not in ('_m', 'maritime7'):
            unrecognized.append(k)
            continue
        if db_key in ('_m', 'maritime7'):
            setattr(ship, db_key, 1 if v else 0)
        else:
            setattr(ship, db_key, v)
    if unrecognized:
        raise HTTPException(status_code=422, detail=f'无效字段: {unrecognized}')

    ship.updated_at = utc_now_ms()
    db.commit()
    db.refresh(ship)
    return ship.serialize


@router.delete('/{ship_id}')
def delete_ship(
    ship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail='船舶不存在')
    db.delete(ship)
    db.commit()
    return {'ok': True}


@router.post('/batch/{date}')
def batch_save(
    date: str,
    ships: List[ShipIn],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """批量替换某日期全部船舶数据（上传Excel时使用）"""
    # 删除该日期旧数据
    db.query(Ship).filter(Ship.date == date).delete()
    # 批量插入新数据
    now = utc_now_ms()
    for s in ships:
        ship = Ship(
            date=date,
            name=s.name,
            en=s.en,
            iv=s.iv,
            ev=s.ev,
            tm=s.tm,
            ar_raw=s.arRaw,
            ar_v=s.arV,
            dr_raw=s.drRaw,
            dr_v=s.drV,
            pp=s.pp,
            np=s.np,
            rm=s.rm,
            eta=s.eta,
            _m=1 if s._m else 0,
            maritime7=1 if s.maritime7 else 0,
            maritime7_note=s.maritime7Note,
            maritime7_by=s.maritime7By,
            biz_type=s.bizType,
            updated_at=now
        )
        db.add(ship)
    db.commit()
    return {'ok': True, 'count': len(ships)}


@router.put('/maritime/{ship_id}')
def update_maritime(
    ship_id: int,
    data: MaritimeDeclUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新海事申报状态"""
    ship = db.query(Ship).filter(Ship.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail='船舶不存在')
    ship.maritime7 = 1 if data.maritime7 else 0
    ship.maritime7_note = data.maritime7Note
    ship.maritime7_by = data.maritime7By
    ship.updated_at = utc_now_ms()
    db.commit()
    return ship.serialize
