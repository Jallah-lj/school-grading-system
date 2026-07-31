import { useEffect, useRef } from 'react';
import { Chart as ChartJS, registerables, type ChartConfiguration } from 'chart.js';

ChartJS.register(...registerables);
ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = 'rgba(148,163,184,0.15)';

/** Thin wrapper around Chart.js: re-creates the chart whenever the config changes. */
export function Chart({ config, height = 260 }: { config: ChartConfiguration; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const configJson = JSON.stringify(config);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new ChartJS(canvasRef.current, JSON.parse(configJson) as ChartConfiguration);
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [configJson]);

  return (
    <div style={{ height }} className="relative">
      <canvas ref={canvasRef} />
    </div>
  );
}
