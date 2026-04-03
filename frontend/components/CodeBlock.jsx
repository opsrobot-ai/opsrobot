import { useState } from "react";

/**
 * CodeBlock — 代码展示框，复制按钮固定在右上角
 *
 * variant:  "dark" | "light" | "auto"
 *           "auto" = 跟随系统深色模式（bg-gray-50 / dark:bg-gray-900）
 * height:   "sm"="max-h-40" | "md"="max-h-48" | "lg"="max-h-56" | "xl"="max-h-64" | "2xl"="max-h-72" | "3xl"="max-h-96"
 * font:     "mono" | "sans"
 * header:   顶部标题文字（可选）
 * text:     复制到剪贴板的内容
 * className: 外层额外 class
 * children: pre 内代码内容
 */
export default function CodeBlock({
  text,
  variant = "dark",
  height = "md",
  font = "mono",
  className = "",
  header,
  children,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const heightMap = {
    sm: "max-h-40",
    md: "max-h-48",
    lg: "max-h-56",
    xl: "max-h-64",
    "2xl": "max-h-72",
    "3xl": "max-h-96",
  };

  const variantMap = {
    dark: "bg-gray-900 text-gray-100",
    light: "bg-gray-50 text-gray-800",
    auto: "bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  const headerVariantMap = {
    dark: "text-gray-400",
    light: "text-gray-500",
    auto: "text-gray-500 dark:text-gray-400",
  };

  return (
    <div
      className={[
        "relative overflow-hidden rounded-lg leading-relaxed",
        variantMap[variant] ?? variantMap.dark,
        font === "sans" ? "font-sans" : "font-mono",
        "text-[11px]",
        className,
      ].join(" ")}
    >
      {header && (
        <div className={["px-3 pt-2.5 pb-1 text-xs font-medium", headerVariantMap[variant] ?? headerVariantMap.dark].join(" ")}>
          {header}
        </div>
      )}
      <pre
        className={[
          heightMap[height] ?? "max-h-48",
          header ? "pt-0" : "p-3",
          "pr-10 overflow-auto whitespace-pre-wrap break-words leading-relaxed",
        ].join(" ")}
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "已复制" : "复制代码"}
        className="absolute top-2 right-2 shrink-0 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200 dark:hover:bg-gray-600"
      >
        {copied ? (
          <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
        )}
      </button>
    </div>
  );
}
