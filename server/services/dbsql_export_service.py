"""DBSQL Export Service.

This service exports all workshop data from SQLite to Databricks DBSQL tables.
"""

import logging
import sqlite3
from typing import Any

import databricks.sql as sql
import pandas as pd

logger = logging.getLogger(__name__)


class DBSQLExportService:
    """Service for exporting SQLite data to Databricks DBSQL tables."""

    def __init__(
        self,
        databricks_host: str,
        databricks_token: str,
        http_path: str,
        catalog: str,
        schema_name: str,
    ):
        """Initialize DBSQL export service.

        Args:
            databricks_host: Databricks workspace URL
            databricks_token: Databricks access token
            http_path: DBSQL warehouse HTTP path
            catalog: Unity Catalog catalog name
            schema_name: Unity Catalog schema name
        """
        self.databricks_host = databricks_host
        self.databricks_token = databricks_token
        self.http_path = http_path
        self.catalog = catalog
        self.schema_name = schema_name

        # Configure authentication
        import os

        os.environ["DATABRICKS_HOST"] = databricks_host
        os.environ["DATABRICKS_TOKEN"] = databricks_token

        logger.info(f"DBSQL Export Service initialized for {catalog}.{schema_name}")

    def get_connection(self):
        """Get DBSQL connection."""
        return sql.connect(
            server_hostname=self.databricks_host,
            http_path=self.http_path,
            access_token=self.databricks_token,
        )

    def read_table(self, table_name: str, conn) -> pd.DataFrame:
        """Read data from DBSQL table."""
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT * FROM {table_name}")
            return cursor.fetchall_arrow().to_pandas()

    def insert_overwrite_table(self, table_name: str, df: pd.DataFrame, conn):
        """Insert or overwrite data in DBSQL table."""
        if df.empty:
            logger.warning(f"No data to insert for table {table_name}")
            return

        with conn.cursor() as cursor:
            # Convert DataFrame to list of tuples
            rows = [tuple(row) for row in df.values]

            # Create placeholders for the INSERT statement
            placeholders = ",".join(["?" for _ in df.columns])
            columns = ",".join(df.columns)

            # Clear existing data
            cursor.execute(f"DELETE FROM {table_name}")

            # Insert new data
            cursor.executemany(f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})", rows)

            logger.info(f"Inserted {len(rows)} rows into {table_name}")

    def create_table_if_not_exists(self, table_name: str, df: pd.DataFrame, conn):
        """Create DBSQL table, dropping existing table if it exists to ensure schema is up to date."""
        if df.empty:
            logger.info(f"Skipping table {table_name} - no data to export")
            return True  # Return True to indicate success (no action needed)

        # Generate CREATE TABLE statement
        columns = []
        for col_name, dtype in df.dtypes.items():
            # Map pandas dtypes to SQL types
            if dtype == "object":
                sql_type = "STRING"
            elif dtype == "int64":
                sql_type = "BIGINT"
            elif dtype == "float64":
                sql_type = "DOUBLE"
            elif dtype == "bool":
                sql_type = "BOOLEAN"
            elif dtype == "datetime64[ns]":
                sql_type = "TIMESTAMP"
            else:
                sql_type = "STRING"

            columns.append(f"{col_name} {sql_type}")

        try:
            with conn.cursor() as cursor:
                # Drop table if it exists to ensure schema is current
                drop_sql = f"DROP TABLE IF EXISTS {table_name}"
                cursor.execute(drop_sql)
                logger.info(f"Dropped existing table {table_name} (if it existed)")

                # Create table with current schema
                create_sql = f"""
                CREATE TABLE {table_name} (
                    {", ".join(columns)}
                )
                """
                cursor.execute(create_sql)
                logger.info(f"Created table {table_name} with {len(columns)} columns")
                return True
        except Exception as e:
            logger.error(f"Failed to create table {table_name}: {e!s}")
            return False

    def get_sqlite_data(self, db_path: str) -> dict[str, pd.DataFrame]:
        """Extract all data from SQLite database."""
        try:
            conn = sqlite3.connect(db_path)

            # Get all table names
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in cursor.fetchall()]

            data = {}
            for table in tables:
                try:
                    df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
                    data[table] = df
                    logger.info(f"Extracted {len(df)} rows from {table}")
                except Exception as e:
                    logger.error(f"Failed to extract data from {table}: {e!s}")

            conn.close()
            return data

        except Exception as e:
            logger.error(f"Failed to connect to SQLite database: {e!s}")
            return {}

    def export_workshop_data(self, db_path: str) -> dict[str, Any]:
        """Export all workshop data from SQLite to DBSQL tables.

        Args:
            db_path: Path to SQLite database file

        Returns:
            Dictionary with export results
        """
        try:
            logger.info("Starting DBSQL export of workshop data")

            # Extract data from SQLite
            sqlite_data = self.get_sqlite_data(db_path)

            if not sqlite_data:
                return {"success": False, "error": "No data found in SQLite database"}

            # Connect to DBSQL
            conn = self.get_connection()

            export_results = {"success": True, "tables_exported": [], "total_rows": 0, "errors": []}

            # Export each table
            for table_name, df in sqlite_data.items():
                try:
                    # Create full table name
                    full_table_name = f"{self.catalog}.{self.schema_name}.{table_name}"

                    # Create table if it doesn't exist
                    if not self.create_table_if_not_exists(full_table_name, df, conn):
                        export_results["errors"].append(f"Failed to create table {table_name}")
                        continue

                    # Skip data insertion for empty tables
                    if df.empty:
                        logger.info(f"Skipping data insertion for empty table {table_name}")
                        export_results["tables_exported"].append(
                            {
                                "table_name": table_name,
                                "full_table_name": full_table_name,
                                "rows_exported": 0,
                                "status": "skipped_empty",
                            }
                        )
                        continue

                    # Insert data
                    self.insert_overwrite_table(full_table_name, df, conn)

                    export_results["tables_exported"].append(
                        {
                            "table_name": table_name,
                            "full_table_name": full_table_name,
                            "rows_exported": len(df),
                            "status": "exported",
                        }
                    )
                    export_results["total_rows"] += len(df)

                    logger.info(f"Successfully exported {len(df)} rows to {full_table_name}")

                except Exception as e:
                    error_msg = f"Failed to export table {table_name}: {e!s}"
                    logger.error(error_msg)
                    export_results["errors"].append(error_msg)

            conn.close()

            logger.info(
                f"DBSQL export completed. Exported {export_results['total_rows']} total rows across {len(export_results['tables_exported'])} tables"
            )

            return export_results

        except Exception as e:
            logger.error(f"Failed to export workshop data to DBSQL: {e!s}")
            return {"success": False, "error": str(e)}
