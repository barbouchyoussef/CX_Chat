import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

def load_env_file():
    # Windows editors often save .env files in cp1252/latin-1 instead of UTF-8.
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            load_dotenv(encoding=encoding)
            return
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError(
        "env",
        b"",
        0,
        1,
        "Unable to decode .env with utf-8, cp1252, or latin-1",
    )


load_env_file()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in .env")

print("DATABASE_URL:", DATABASE_URL)  # debug

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()
