export default function MonitorPanel({ title, children, className = "", headerExtra }) {
  return (
    <div
      className={`relative bg-[#020b1a]/60 border border-[#16436e] shadow-[inset_0_0_20px_rgba(0,163,255,0.1)] rounded flex flex-col backdrop-blur-sm overflow-hidden ${className}`}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00f0ff]" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00f0ff]" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00f0ff]" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00f0ff]" />

      {title && (
        <div className="relative h-[38px] w-full flex items-center justify-between px-4 pt-1">
          {/* 底部贯穿细线 */}
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[#16436e]"></div>
          
          {/* 装饰与标题容器 */}
          <div className="flex items-center h-full w-full relative z-10">
            
            {/* 左侧三个倾斜的平行四边形 /// */}
            <div className="flex space-x-[3px] -skew-x-[30deg] mr-5 z-20">
              <div className="w-[5px] h-[10px] bg-[#00f0ff] opacity-30"></div>
              <div className="w-[5px] h-[10px] bg-[#00f0ff] opacity-60"></div>
              <div className="w-[5px] h-[10px] bg-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.8)]"></div>
            </div>
            
            {/* 标题区域背景与底部亮线 (绝对定位以确保贴底) */}
            <div className="absolute bottom-0 left-[42px] w-[60%] h-[24px] bg-gradient-to-r from-[#073d70]/90 via-[#073d70]/40 to-transparent"></div>
            <div className="absolute bottom-0 left-[42px] w-[50%] h-[2px] bg-gradient-to-r from-[#00f0ff] via-[#0088ff] to-transparent shadow-[0_0_10px_rgba(0,240,255,0.8)] z-20"></div>
            
            {/* 标题文本 */}
            <span className="relative ml-2 z-20 text-[#e2f1fa] text-[15px] font-bold tracking-widest drop-shadow-[0_0_2px_rgba(0,240,255,0.5)] translate-y-[1px]">
              {title}
            </span>
            
            <div className="ml-auto relative z-20 translate-y-[1px]">
              {headerExtra}
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 relative">{children}</div>
    </div>
  );
}
