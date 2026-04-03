#!/bin/bash
# 等待 Doris FE 就绪
echo "等待 Doris 就绪..."
until mysql -h"${DORIS_HOST:-doris}" -P"${DORIS_PORT:-9030}" -uroot -e "SELECT 1" &>/dev/null; do
  echo "等待中..."
  sleep 2
done
echo "Doris 已就绪"

# 执行初始化 SQL
echo "初始化数据库 schema..."
mysql -h"${DORIS_HOST:-doris}" -P"${DORIS_PORT:-9030}" -uroot < /docker-entrypoint-initdb.d/init-doris-schema.sql
echo "初始化完成"