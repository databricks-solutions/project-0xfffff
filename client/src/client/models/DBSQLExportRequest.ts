/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for DBSQL export operations.
 */
export type DBSQLExportRequest = {
    /**
     * DBSQL warehouse HTTP path (e.g., /sql/1.0/warehouses/xxxxxx)
     */
    http_path: string;
    /**
     * Unity Catalog catalog name
     */
    catalog: string;
    /**
     * Unity Catalog schema name
     */
    schema_name: string;
};

