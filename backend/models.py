"""数据模型 — ships / blackboard / workflow / users"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from database import Base


def utc_now_ms():
    return datetime.now(timezone.utc).timestamp() * 1000


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


class User(Base):
    __tablename__ = 'users'

    username = Column(String(50), primary_key=True)
    password_hash = Column(String(128), nullable=False)
    role = Column(String(20), nullable=False, default='dispatcher')  # admin / leader / dispatcher
    created_at = Column(Float, default=utc_now_ms)

    @property
    def serialize(self):
        return {
            'username': self.username,
            'role': self.role,
            'created': self.created_at
        }


class Ship(Base):
    __tablename__ = 'ships'

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    en = Column(String(100), default='')
    iv = Column(String(50), default='')   # 进口航次
    ev = Column(String(50), default='')   # 出口航次
    tm = Column(String(100), default='')  # 码头
    ar_raw = Column(String(50), default='')   # 抵港吃水原始值
    ar_v = Column(Float, nullable=True)       # 抵港吃水数值
    dr_raw = Column(String(50), default='')   # 开航吃水原始值
    dr_v = Column(Float, nullable=True)       # 开航吃水数值
    pp = Column(String(50), default='—')      # 上港
    np = Column(String(50), default='—')      # 下港
    rm = Column(String(200), default='—')     # 备注
    eta = Column(String(20), default='')      # ETA (M/DDHHMM)
    _m = Column(Integer, default=0)           # 手动录入标记
    maritime7 = Column(Integer, default=0)    # 7日海事完成
    maritime7_note = Column(String(200), default='')
    maritime7_by = Column(String(50), default='')
    biz_type = Column(String(20), default='')  # container / bulk / river
    updated_at = Column(Float, default=utc_now_ms)

    __table_args__ = (
        Index('idx_ship_voyage', 'name', 'iv', 'ev'),
    )

    @property
    def serialize(self):
        return {
            'id': self.id,
            'date': self.date,
            'name': self.name,
            'en': self.en,
            'iv': self.iv,
            'ev': self.ev,
            'tm': self.tm,
            'arRaw': self.ar_raw,
            'arV': self.ar_v,
            'drRaw': self.dr_raw,
            'drV': self.dr_v,
            'pp': self.pp,
            'np': self.np,
            'rm': self.rm,
            'eta': self.eta,
            '_m': bool(self._m),
            'maritime7': bool(self.maritime7),
            'maritime7Note': self.maritime7_note,
            'maritime7By': self.maritime7_by,
            'bizType': self.biz_type,
        }


class BlackboardMessage(Base):
    __tablename__ = 'blackboard'

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)
    author = Column(String(50), nullable=False)
    role = Column(String(20), default='dispatcher')
    message = Column(String(1000), nullable=False)
    ts = Column(Float, nullable=False, default=utc_now_ms)

    @property
    def serialize(self):
        return {
            'id': self.id,
            'date': self.date,
            'author': self.author,
            'role': self.role,
            'message': self.message,
            'ts': self.ts,
        }


class WorkflowRecord(Base):
    __tablename__ = 'workflow'

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    en = Column(String(100), default='')
    iv = Column(String(50), default='')
    ev = Column(String(50), default='')
    tm = Column(String(100), default='')
    ar_v = Column(Float, nullable=True)
    dr_v = Column(Float, nullable=True)
    ar_raw = Column(String(50), default='')
    dr_raw = Column(String(50), default='')
    eta = Column(String(20), default='')
    pp = Column(String(50), default='')
    np = Column(String(50), default='')
    schedule_status = Column(String(20), default='done')
    schedule_by = Column(String(50), default='auto')
    schedule_at = Column(String(30), default='')
    pilotage_status = Column(String(20), default='pending')
    pilotage_by = Column(String(50), default='')
    pilotage_at = Column(String(30), default='')
    single_window_status = Column(String(20), default='pending')
    single_window_by = Column(String(50), default='')
    single_window_at = Column(String(30), default='')
    channel_pass_status = Column(String(20), default='pending')
    channel_pass_by = Column(String(50), default='')
    channel_pass_at = Column(String(30), default='')
    channel = Column(String(10), default='')       # 南/北
    pass_time = Column(String(20), default='')     # 走槽时间
    note = Column(String(500), default='')
    created_at = Column(String(30), default='')
    updated_at = Column(String(30), default='')

    @property
    def serialize(self):
        return {
            'id': self.id,
            'date': self.date,
            'name': self.name,
            'en': self.en,
            'iv': self.iv,
            'ev': self.ev,
            'tm': self.tm,
            'arV': self.ar_v,
            'drV': self.dr_v,
            'arRaw': self.ar_raw,
            'drRaw': self.dr_raw,
            'eta': self.eta,
            'pp': self.pp,
            'np': self.np,
            'schedule': {'status': self.schedule_status, 'by': self.schedule_by, 'at': self.schedule_at},
            'pilotage': {'status': self.pilotage_status, 'by': self.pilotage_by, 'at': self.pilotage_at},
            'singleWindow': {'status': self.single_window_status, 'by': self.single_window_by, 'at': self.single_window_at},
            'channelPass': {
                'status': self.channel_pass_status,
                'by': self.channel_pass_by,
                'at': self.channel_pass_at,
                'channel': self.channel,
                'passTime': self.pass_time
            },
            'note': self.note,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
        }
