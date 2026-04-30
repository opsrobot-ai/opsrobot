import intl from "react-intl-universal";

/**
 * 统一的“返回 + 路径”头部样式：
 * - 单行：返回按钮 + 面包屑路径并排
 * - 面包屑：默认非末段可点击（若提供 onBack，则点击触发返回）
 */
export default function PathHeader({ onBack, backLabel, segments = [], onSegmentClick }) {
  const resolvedBackLabel = backLabel || intl.get("dataCatalog.actions.back");
  const segs = (segments || []).filter((s) => s != null && String(s).trim() !== "");

  return (
    <div className="flex flex-wrap items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          {resolvedBackLabel}
        </button>
      ) : null}

      <nav className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
        {segs.map((label, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === segs.length - 1;
          const key = `${idx}-${String(label)}`;
          const clickable = !isLast && (typeof onSegmentClick === "function" || typeof onBack === "function");
          const cls = [
            isFirst ? "font-semibold text-gray-900 dark:text-gray-100" : "",
            clickable ? "cursor-pointer hover:underline" : "",
            "truncate",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span
              key={key}
              className={cls}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => {
                if (!clickable) return;
                if (typeof onSegmentClick === "function") onSegmentClick(idx);
                else onBack?.();
              }}
              onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (typeof onSegmentClick === "function") onSegmentClick(idx);
                  else onBack?.();
                }
              }}
            >
              {label}
              {idx < segs.length - 1 ? <span className="mx-1.5 text-gray-400">/</span> : null}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

