"""数据库连接 — SQLite WAL模式，并发友好"""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_DIR = os.environ.get('DB_DIR', os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(DB_DIR, 'dispatch.db')
DATABASE_URL = f'sqlite:///{DB_PATH}'

engine = create_engine(
    DATABASE_URL,
    connect_args={'check_same_thread': False},
    echo=False,
    pool_pre_ping=True,
)

# WAL模式 — 允许并发读写
@event.listens_for(engine, 'connect')
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute('PRAGMA journal_mode=WAL')
    cursor.execute('PRAGMA foreign_keys=ON')
    cursor.execute('PRAGMA busy_timeout=5000')
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
