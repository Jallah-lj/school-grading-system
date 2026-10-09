import { Chart as ChartJS, registerables, type ChartConfiguration } from 'chart.js';
import { useEffect, useRef } from 'react';

ChartJS.register(...registerables);
ChartJS.defaults.font.family = '"Public Sans", ui-sans-serif, system-ui, sans-serif';
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = '#a8a29e';
ChartJS.defaults.borderColor = 'rgba(168,162,158,0.2)';

/**
 * Serialise a Chart.js config for change detection. Unlike plain
 * JSON.stringify this keeps function properties (tooltip callbacks) so configs
 * containing them are still compared — and passed through — intact.
 */
function configKey(config: ChartConfiguration): string {
  return JSON.stringify(config, (_k, v) => (typeof v === 'function' ? `ƒ:${v.toString()}` : v));
}

/** Thin wrapper around Chart.js: re-creates the chart whenever the config changes. */
export function Chart({
  config,
  height = 260,
  ariaLabel,
}: {
  config: ChartConfiguration;
  height?: number;
  /** Description for assistive technology (charts are images of data). */
  ariaLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  // Keep the freshest config (with live function references) for the next build.
  const configRef = useRef(config);
  configRef.current = config;
  const key = configKey(config);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new ChartJS(canvasRef.current, configRef.current);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [key]);

  return (
    <div
      style={{ height }}
      className="relative w-full min-w-0"
      role="img"
      aria-label={ariaLabel ?? 'Data chart'}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
