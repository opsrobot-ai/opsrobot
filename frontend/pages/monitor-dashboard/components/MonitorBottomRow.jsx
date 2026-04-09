import ReactECharts from "echarts-for-react";
import {
  IO_DONUT_COLORS,
  IO_DONUT_DATA,
  MODEL_DONUT_COLORS,
  MODEL_DONUT_DATA,
} from "../constants.js";
import { getDonutOption, getTrendOption, getTopAgentOption } from "../chartOptions.js";
import MonitorPanel from "./MonitorPanel.jsx";

export default function MonitorBottomRow() {
  return (
    <div className="flex flex-col lg:flex-row gap-3 flex-[3] min-h-[220px]">
      <MonitorPanel title="Token 消耗 Top10 Agent" className="w-full lg:w-1/4 h-full">
        <ReactECharts option={getTopAgentOption()} style={{ height: "100%", width: "100%" }} />
      </MonitorPanel>

      <MonitorPanel title="Token 消耗分布" className="w-full lg:w-2/4 h-full">
        <div className="flex h-full items-center">
          <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
            <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">大模型 Token 消耗分布</div>
            <div className="w-full h-full pt-4 sm:pt-6">
              <ReactECharts
                option={getDonutOption(MODEL_DONUT_DATA, MODEL_DONUT_COLORS)}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          </div>
          <div className="w-px h-[60%] bg-gradient-to-b from-transparent via-[#16436e] to-transparent" />
          <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
            <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">Input / Output Token 消耗分布</div>
            <div className="w-full h-full pt-4 sm:pt-6">
              <ReactECharts
                option={getDonutOption(IO_DONUT_DATA, IO_DONUT_COLORS)}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          </div>
        </div>
      </MonitorPanel>

      <MonitorPanel
        title="会话趋势"
        className="w-full lg:w-1/4 h-full"
        headerExtra={
          <div className="flex items-center gap-2 text-[10px] sm:text-xs">
            <div className="text-[#8fb1c6]">
              近14天 <span className="text-white font-mono ml-1">8,098</span>
            </div>
          </div>
        }
      >
        <ReactECharts option={getTrendOption()} style={{ height: "100%", width: "100%" }} />
      </MonitorPanel>
    </div>
  );
}
