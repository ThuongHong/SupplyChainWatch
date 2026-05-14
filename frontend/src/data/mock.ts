function genDates(days: number): string[] {
  const d: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(2026, 4, 14)
    dt.setDate(dt.getDate() - i)
    d.push(dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  }
  return d
}

export const MOCK = {
  bdi30: [1658,1671,1649,1682,1701,1695,1723,1718,1742,1756,1738,1761,1779,1792,1785,1768,1791,1803,1812,1798,1821,1835,1829,1818,1841,1856,1862,1839,1851,1847],
  fbx30: [2287,2264,2271,2243,2256,2238,2219,2231,2207,2195,2211,2189,2178,2193,2168,2182,2159,2171,2148,2163,2141,2155,2132,2147,2138,2161,2149,2163,2145,2156],
  dates30: genDates(30),
  bdiSpark: [1738,1761,1779,1792,1785,1768,1791,1803,1812,1798,1821,1835,1829,1847],
  fbxSpark: [2211,2189,2178,2193,2168,2182,2159,2171,2148,2163,2141,2155,2145,2156],
  vesselSpark: [12691,12704,12698,12723,12735,12741,12719,12756,12778,12791,12803,12812,12831,12847],
  anomalySpark: [3,2,4,2,1,3,2,5,3,4,6,4,5,7],
  insights: [
    { text: 'BDI surged 4.2% over 3 consecutive sessions, correlating with a spike in Chinese iron ore imports.', category: 'trend' as const, time: '12m ago' },
    { text: 'Shanghai port congestion hit a 90-day high — 142 vessels currently at anchor.', category: 'anomaly' as const, time: '38m ago' },
    { text: 'FBX China→US West Coast rates diverging from historical BDI correlation (r² dropped to 0.61).', category: 'correlation' as const, time: '1h ago' },
    { text: '14-day forecast: BDI expected to test resistance at 1,900 (82% confidence).', category: 'forecast' as const, time: '2h ago' },
    { text: 'Suez Canal average transit time increased 18% WoW, signaling potential bottleneck.', category: 'anomaly' as const, time: '3h ago' },
  ],
}

export const fmtNum = (n: number) => n.toLocaleString('en-US')
export const fmtPct = (n: number, sign = true) => (sign && n > 0 ? '+' : '') + n.toFixed(1) + '%'
