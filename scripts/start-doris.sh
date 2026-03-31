#!/bin/bash
# Doris 启动脚本：作为主进程的中继，启动后台初始化

set -e

INIT_SQL="/opt/apache-doris/init-doris-schema.sql"

# 后台初始化线程
(
    echo "后台初始化线程已启动，等待服务就绪..."
    
    # 等待 FE 就绪（使用 mysql client 检查）
    until mysql -h127.0.0.1 -P9030 -uroot -e "SELECT 1" >/dev/null 2>&1; do
        sleep 5
    done
    echo "Doris FE 已就绪"

    # 等待 BE 就绪 (单节点环境)
    until mysql -h127.0.0.1 -P9030 -uroot -e "SHOW BACKENDS\G" 2>/dev/null | grep -q "Alive: true"; do
        sleep 5
    done
    echo "Doris BE 已就绪"

    # 执行初始化脚本（如果存在）
    if [ -f "$INIT_SQL" ]; then
        echo "执行数据库初始化: $INIT_SQL"
        mysql -h127.0.0.1 -P9030 -uroot < "$INIT_SQL"
        echo "数据库初始化完成"
    fi
) &

# 移交给镜像原始的 Entrypoint 运行
echo "执行原始 Entrypoint..."
exec /entrypoint.sh "$@"
