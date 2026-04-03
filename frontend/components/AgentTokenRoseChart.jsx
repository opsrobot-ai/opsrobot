import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

/**
 * 南丁格尔玫瑰图：等分角、半径表示数值；圆角与扇区间隙参考 ECharts 饼图 roseType
 */
export default function AgentTokenRoseChart({ data, height = 360 }) {
  const option = useMemo(() => {
    const seriesData = data.map((d) => ({
      value: d.value,
      name: d.name,
      itemStyle: {
        color: d.fill,
        borderRadius: 10,
        borderColor: "#ffffff",
        borderWidth: 2,
      },
      labelLine: {
        lineStyle: {
          color: d.fill,
          width: 1,
          opacity: 0.75,
        },
      },
    }));

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255,255,255,0.96)",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        textStyle: { color: "#374151", fontSize: 12 },
        formatter: (params) =>
          `${params.marker}<span style="font-weight:600">${params.name}</span><br/>占比：<b>${params.value}%</b>`,
      },
      series: [
        {
          type: "pie",
          roseType: "radius",
          radius: ["26%", "72%"],
          center: ["50%", "50%"],
          padAngle: 0.06,
          avoidLabelOverlap: true,
          itemStyle: {
            shadowBlur: 0,
          },
          label: {
            show: true,
            position: "outside",
            formatter: "{b}\n{c}%",
            color: "#4b5563",
            fontSize: 11,
            lineHeight: 16,
          },
          labelLine: {
            show: true,
            length: 10,
            length2: 14,
            smooth: false,
          },
          emphasis: {
            scale: true,
            scaleSize: 4,
            itemStyle: {
              shadowBlur: 12,
              shadowColor: "rgba(22, 93, 255, 0.25)",
            },
          },
          data: seriesData,
        },
      ],
    };
  }, [data]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
      notMerge
      lazyUpdate
    />
  );
}
