import React from 'react';
import type ReactECharts from 'echarts-for-react';

export function useCompactMobileLayout(chartRef: React.RefObject<ReactECharts | null>): boolean {
  const [compactMobileLayout, setCompactMobileLayout] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncCompactLayout = () => setCompactMobileLayout(window.innerWidth < 640);
    const triggerResize = () => {
      window.requestAnimationFrame(() => {
        chartRef.current?.getEchartsInstance().resize();
      });
      window.setTimeout(() => {
        chartRef.current?.getEchartsInstance().resize();
      }, 220);
    };

    const onViewportChange = () => {
      syncCompactLayout();
      triggerResize();
    };

    syncCompactLayout();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  }, [chartRef]);

  return compactMobileLayout;
}
