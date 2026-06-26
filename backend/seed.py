import os
import sys
import re
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

def load_env():
    # Load .env file
    env_path = Path(__file__).resolve().parent / ".env"
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            load_dotenv(dotenv_path=env_path, encoding=encoding, override=True)
            return
        except UnicodeDecodeError:
            continue

def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL is not set in environment or .env file.")
        sys.exit(1)
    
    # Strip any SQLAlchemy async/sync dialect prefixes
    cleaned_url = re.sub(r"^postgresql\+[a-zA-Z0-9_-]+://", "postgresql://", database_url)
    cleaned_url = re.sub(r"^postgres\+[a-zA-Z0-9_-]+://", "postgresql://", cleaned_url)
    if cleaned_url.startswith("postgres://"):
        cleaned_url = cleaned_url.replace("postgres://", "postgresql://", 1)
        
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(cleaned_url)
        return conn
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

def run_migrations(conn):
    migrations_dir = Path(__file__).resolve().parent / "migrations"
    if not migrations_dir.exists():
        print(f"Error: Migrations directory '{migrations_dir}' not found.")
        sys.exit(1)
        
    # Get all .sql files and sort them
    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        print("No SQL migration files found.")
        return

    # Create migration history table if not exists
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS migration_history (
                filename VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        conn.commit()

        # Query applied migrations
        cur.execute("SELECT filename FROM migration_history;")
        applied = {row[0] for row in cur.fetchall()}

    print(f"Found {len(sql_files)} migration files. {len(applied)} already marked as applied.")

    for sql_file in sql_files:
        filename = sql_file.name
        if filename in applied:
            continue
            
        print(f"Applying migration: {filename}...")
        with open(sql_file, "r", encoding="utf-8") as f:
            sql_content = f.read()

        try:
            with conn.cursor() as cur:
                cur.execute(sql_content)
                cur.execute(
                    "INSERT INTO migration_history (filename) VALUES (%s);",
                    (filename,)
                )
            conn.commit()
            print(f"Successfully applied {filename}")
        except psycopg2.DatabaseError as e:
            conn.rollback()
            # PostgreSQL error codes:
            # 42P07: duplicate_table
            # 42701: duplicate_column
            # 42710: duplicate_object (e.g. constraints, indexes)
            if e.pgcode in ("42P07", "42701", "42710"):
                print(f"Migration {filename} structural elements already exist ({e.pgcode}). Marking as applied...")
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO migration_history (filename) VALUES (%s) ON CONFLICT DO NOTHING;",
                            (filename,)
                        )
                    conn.commit()
                except Exception as inner_e:
                    conn.rollback()
                    print(f"Failed to record migration: {inner_e}")
            else:
                print(f"Error applying migration {filename}: {e}")
                sys.exit(1)
        except Exception as e:
            conn.rollback()
            print(f"Unexpected error applying migration {filename}: {e}")
            sys.exit(1)

    print("Database seeding and migration completed successfully.")

def main():
    load_env()
    conn = get_connection()
    try:
        run_migrations(conn)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
