export const EXTERNAL_CATALOG_TYPES = [
  "mysql",
  "postgresql",
  "oracle",
  "sqlserver",
  "tidb",
  "mongodbbi",
  "impala",
  "doris",
  "clickhouse",
  "starrocks",
  "elasticsearch",
  "hive",
  "iceberg",
  "redshift",
  "hudi",
  "jdbc",
  "fileLocalExcelCsv",
  "fileRemoteExcelCsv",
  "paimon",
];

export const ALL_CATALOG_TYPES = ["internal", ...EXTERNAL_CATALOG_TYPES];
