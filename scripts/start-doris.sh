#!/bin/bash
# Doris 启动脚本：只启动 FE (不启动 BE)

set -e

INIT_SQL="/opt/apache-doris/init-doris-schema.sql"

# 只启动 FE
echo "启动 Doris FE..."
bash /opt/apache-doris/fe/bin/start_fe.sh --daemon

# 等待 FE 就绪（使用 mysql client 检查）
echo "等待 Doris FE 就绪..."
until mysql -h127.0.0.1 -P9030 -uroot -e "SELECT 1" >/dev/null 2>&1; do
    echo "等待 FE 就绪中..."
    sleep 3
done
echo "Doris FE 已就绪"

# 执行初始化脚本（如果存在）
if [ -f "$INIT_SQL" ]; then
    echo "执行数据库初始化..."
    mysql -h127.0.0.1 -P9030 -uroot < "$INIT_SQL"
    echo "数据库初始化完成"
else
    echo "未找到初始化脚本: $INIT_SQL"
fi

# 保持容器运行
echo "Doris FE 启动完成，容器保持运行..."
sleep infinity