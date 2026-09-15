import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")

# Ensure data directory exists
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/docchat.db")

# If using relative sqlite path, resolve relative to backend_dir
if DATABASE_URL.startswith("sqlite:///./"):
    rel_path = DATABASE_URL.replace("sqlite:///./", "")
    db_file_path = backend_dir / rel_path
    db_file_path.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{db_file_path.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
