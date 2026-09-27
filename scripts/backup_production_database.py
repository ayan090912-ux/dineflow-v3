import os
import json
import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

SOURCE_URL = os.environ.get("DATABASE_URL")
if not SOURCE_URL:
    raise ValueError("DATABASE_URL environment variable is required to run backup.")
BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime,)):
            return obj.isoformat()
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, bytes):
            return obj.hex()
        return super().default(obj)

async def dump_database():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = os.path.join(BACKUP_DIR, f"production_backup_{timestamp}.json")
    sql_path = os.path.join(BACKUP_DIR, f"production_backup_{timestamp}.sql")
    
    print(f"[BACKUP] Connecting to source database: {SOURCE_URL.split('@')[1]}")
    connect_args = {"ssl": "require", "statement_cache_size": 0}
    engine = create_async_engine(SOURCE_URL, connect_args=connect_args)
    
    host_info = SOURCE_URL.split("@")[1].split("/")[0] if "@" in SOURCE_URL else "configured-database"
    backup_data = {
        "timestamp": timestamp,
        "source": host_info,
        "tables": {}
    }
    
    sql_statements = [
        f"-- Dinely Production Database Backup",
        f"-- Timestamp: {timestamp} UTC",
        f"-- Source: {host_info}",
        "BEGIN;\n"
    ]
    
    async with engine.connect() as conn:
        tbl_res = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
        ))
        tables = [r[0] for r in tbl_res.fetchall() if r[0] != "playing_with_neon"]
        print(f"[BACKUP] Found {len(tables)} tables to backup: {tables}")
        
        priority_order = [
            "restaurants",
            "restaurant_domains",
            "restaurant_memberships",
            "platform_admins",
            "refresh_tokens",
            "suppliers",
            "inventory_items",
            "menu_categories",
            "menu_items",
            "tables",
            "table_sessions",
            "orders",
            "order_items",
            "bills",
            "taxes",
            "tax_categories",
            "tax_menu_items",
            "tax_audit_logs",
            "customer_requests",
            "restaurant_lifecycle_logs",
            "invoice_taxes"
        ]
        
        sorted_tables = [t for t in priority_order if t in tables]
        for t in tables:
            if t not in sorted_tables:
                sorted_tables.append(t)
                
        row_counts = {}
        
        for table in sorted_tables:
            # Query table with mappings
            rows_res = await conn.execute(text(f"SELECT * FROM \"{table}\";"))
            mapped_rows = rows_res.mappings().all()
            row_counts[table] = len(mapped_rows)
            
            if mapped_rows:
                cols = list(mapped_rows[0].keys())
            else:
                col_res = await conn.execute(text(
                    f"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{table}' ORDER BY ordinal_position;"
                ))
                cols = [r[0] for r in col_res.fetchall()]
                
            table_records = []
            for row in mapped_rows:
                table_records.append(dict(row))
                
            backup_data["tables"][table] = {
                "columns": cols,
                "count": len(mapped_rows),
                "rows": table_records
            }
            
            # Generate SQL INSERT statements
            if mapped_rows:
                col_names = ", ".join([f"\"{c}\"" for c in cols])
                sql_statements.append(f"-- Table: {table} ({len(mapped_rows)} records)")
                for row_dict in table_records:
                    vals = []
                    for col in cols:
                        v = row_dict.get(col)
                        if v is None:
                            vals.append("NULL")
                        elif isinstance(v, (int, float)):
                            vals.append(str(v))
                        elif isinstance(v, bool):
                            vals.append("TRUE" if v else "FALSE")
                        elif isinstance(v, (dict, list)):
                            escaped_json = json.dumps(v).replace("'", "''")
                            vals.append(f"'{escaped_json}'::jsonb")
                        elif isinstance(v, datetime):
                            vals.append(f"'{v.isoformat()}'::timestamptz")
                        else:
                            escaped_str = str(v).replace("'", "''")
                            vals.append(f"'{escaped_str}'")
                    val_str = ", ".join(vals)
                    sql_statements.append(f"INSERT INTO \"{table}\" ({col_names}) VALUES ({val_str}) ON CONFLICT DO NOTHING;")
                sql_statements.append("")
            
            print(f"  -> Table '{table}': {len(mapped_rows)} rows backed up.")
            
    sql_statements.append("COMMIT;\n")
    
    # Write JSON backup
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, cls=CustomEncoder, indent=2)
        
    # Write SQL backup
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_statements))
        
    print(f"\n[BACKUP COMPLETED SUCCESSFULLY]")
    print(f"JSON Backup: {json_path} ({os.path.getsize(json_path)} bytes)")
    print(f"SQL Backup:  {sql_path} ({os.path.getsize(sql_path)} bytes)")
    print(f"Summary of rows: {row_counts}")
    
    await engine.dispose()
    return json_path, sql_path, row_counts

if __name__ == "__main__":
    asyncio.run(dump_database())
