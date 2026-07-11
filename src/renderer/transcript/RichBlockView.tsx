/**
 * Rich data-view renderers — Electron counterpart of the TUI's BarChart,
 * LineChart, PieChart, WeatherCard, and SourceCards components (app.tsx).
 *
 * Uses the same pure parsing/layout functions from rich-blocks.ts (already
 * synced with the TUI 1:1) and renders the output as styled HTML.  The visual
 * shape mirrors the TUI: bar charts are horizontal labeled bars, line charts
 * are braille plots or block sparklines, pie charts are a colored disc +
 * legend, weather is a card with chips, sources are external-link cards.
 */
import {
  barChartLayout,
  barGlyphs,
  brailleChart,
  compactNum,
  parseChart,
  parseSeries,
  parseWeather,
  parseSources,
  pieGrid,
  pieLayout,
  resamplePoints,
  sharePercents,
  sparkLayout,
  sparkline,
  sparkRange,
  weatherIcon,
  type RichKind,
  richKind,
} from "../../shared/rich-blocks";
import { displayWidth, truncateWidth } from "../../shared/markdown-blocks";
import { SourceList } from "./SourceList";
import type { Palette } from "../../shared/themes";

// ── helpers (TUI parity: padRight / padLeft in app.tsx) ───────────────────────
function padRight(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - displayWidth(s)));
}
function padLeft(s: string, n: number): string {
  return " ".repeat(Math.max(0, n - displayWidth(s))) + s;
}

// A sensible default width for the Electron rendering (the TUI uses terminal
// column count; here we use a fixed monospace column budget so the ASCII
// shapes look right in a <pre>).
const DEFAULT_WIDTH = 72;

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ body, palette }: { body: string; palette: Palette }) {
  const model = parseChart(body);
  if (model.data.length === 0) {
    return <pre className="rich-fallback">{body}</pre>;
  }
  // Single datum → stat line (one bar carries no information)
  if (model.data.length === 1) {
    const d = model.data[0]!;
    return (
      <div className="rich-bar single">
        {model.title && <div className="rich-title">{model.title}</div>}
        <div className="rich-stat">
          <span style={{ color: palette.series[0] }}>▍ </span>
          <strong style={{ color: palette.assistant }}>{d.display}</strong>
          <span style={{ color: palette.muted }}>  {d.label}</span>
        </div>
      </div>
    );
  }
  const max = Math.max(1, ...model.data.map((d) => d.value));
  const { labelW, valueW, track } = barChartLayout(
    model.data.map((d) => ({ label: d.label, display: d.display })),
    DEFAULT_WIDTH,
  );
  return (
    <div className="rich-bar">
      {model.title && <div className="rich-title">{model.title}</div>}
      {model.data.map((d, i) => {
        const bar = barGlyphs(d.value / max, track);
        const fullCells = /^█*/.exec(bar)![0].length;
        const tailGlyph = bar.slice(fullCells);
        const gap = " ".repeat(Math.max(0, track - displayWidth(bar)));
        const color = palette.series[i % palette.series.length]!;
        return (
          <div key={i} className="rich-bar-row">
            <span className="rich-bar-label" style={{ color: palette.muted }}>
              {padRight(truncateWidth(d.label, labelW), labelW)}  
            </span>
            {fullCells > 0 && (
              <span
                className="rich-bar-fill"
                style={{ backgroundColor: color, width: `${fullCells}ch` }}
              >
                {" ".repeat(fullCells)}
              </span>
            )}
            {tailGlyph && (
              <span style={{ color }}>{tailGlyph}</span>
            )}
            <span style={{ color: palette.assistant }}>
              {gap}  {padLeft(truncateWidth(d.display, valueW), valueW)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Line / sparkline chart ────────────────────────────────────────────────────
function LineChart({
  body,
  palette,
  spark,
}: {
  body: string;
  palette: Palette;
  spark?: boolean;
}) {
  const model = parseSeries(body);
  if (model.series.length === 0) {
    return <pre className="rich-fallback">{body}</pre>;
  }
  const useBraille =
    !spark && model.series.length === 1 && model.series[0]!.points.length >= 2;

  return (
    <div className="rich-line">
      {model.title && <div className="rich-title">{model.title}</div>}
      {useBraille ? (
        <BraillePlot body={body} palette={palette} />
      ) : (
        <Sparklines body={body} palette={palette} />
      )}
    </div>
  );
}

function BraillePlot({ body, palette }: { body: string; palette: Palette }) {
  const model = parseSeries(body);
  const pts = model.series[0]!.points;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const axisW = Math.min(
    Math.max(displayWidth(compactNum(min)), displayWidth(compactNum(max))),
    Math.max(4, DEFAULT_WIDTH - 5),
  );
  const h = 6;
  const w = Math.max(4, DEFAULT_WIDTH - axisW - 1);
  const rows = brailleChart(pts, w, h);
  const color = palette.series[0]!;
  return (
    <pre className="rich-braille" aria-label="Line chart">
      {rows.map((row, i) => (
        <div key={i}>
          <span style={{ color: palette.muted }}>
            {padLeft(
              i === 0 ? compactNum(max) : i === rows.length - 1 ? compactNum(min) : "",
              axisW,
            )}{" "}
          </span>
          <span style={{ color }}>{row}</span>
        </div>
      ))}
    </pre>
  );
}

function Sparklines({ body, palette }: { body: string; palette: Palette }) {
  const model = parseSeries(body);
  const { labelW, sparkW, showRange } = sparkLayout(
    model.series,
    DEFAULT_WIDTH,
  );
  return (
    <pre className="rich-sparklines" aria-label="Sparkline chart">
      {model.series.map((s, i) => {
        const label = s.label
          ? padRight(truncateWidth(s.label, labelW), labelW)
          : "";
        const sp = sparkline(resamplePoints(s.points, sparkW));
        const range = showRange ? `  ${sparkRange(s.points)}` : "";
        const color = palette.series[i % palette.series.length]!;
        return (
          <div key={i}>
            {label && <span style={{ color: palette.muted }}>{label}  </span>}
            <span style={{ color }}>{sp}</span>
            <span style={{ color: palette.muted }}>{range}</span>
          </div>
        );
      })}
    </pre>
  );
}

// ── Pie chart ─────────────────────────────────────────────────────────────────
function PieChartView({ body, palette }: { body: string; palette: Palette }) {
  const model = parseChart(body);
  if (!model.data.some((d) => d.value > 0)) {
    return <pre className="rich-fallback">{body}</pre>;
  }
  const values = model.data.map((d) => d.value);
  const pct = sharePercents(values);
  const { labelW, cols, rows: pieRows } = pieLayout(
    model.data.map((d) => d.label),
    DEFAULT_WIDTH,
  );
  const grid = cols > 0 ? pieGrid(values, cols, pieRows) : [];

  // Run-length encode each grid row (TUI parity: pieRuns in app.tsx)
  function pieRuns(row: number[]): { slice: number; len: number }[] {
    const out: { slice: number; len: number }[] = [];
    for (const s of row) {
      const last = out[out.length - 1];
      if (last && last.slice === s) last.len++;
      else out.push({ slice: s, len: 1 });
    }
    return out;
  }

  return (
    <div className="rich-pie">
      {grid.length > 0 && (
        <pre className="rich-pie-grid" aria-hidden>
          {grid.map((gridRow, ri) => (
            <div key={ri}>
              {pieRuns(gridRow).map((run, ci) => {
                const color =
                  run.slice >= 0
                    ? palette.series[run.slice % palette.series.length]
                    : undefined;
                return (
                  <span
                    key={ci}
                    style={
                      color
                        ? { backgroundColor: color }
                        : undefined
                    }
                  >
                    {" ".repeat(run.len)}
                  </span>
                );
              })}
            </div>
          ))}
        </pre>
      )}
      <div className="rich-pie-legend" style={{ marginLeft: grid.length > 0 ? "0.5rem" : 0 }}>
        {model.data.map((d, i) => {
          const color = palette.series[i % palette.series.length]!;
          return (
            <div key={i} className="rich-pie-legend-row">
              <span style={{ color }}>■ </span>
              <span style={{ color: palette.assistant }}>
                {padRight(truncateWidth(d.label, labelW), labelW)}  
              </span>
              <span style={{ color: palette.muted }}>{pct[i]}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Weather card ──────────────────────────────────────────────────────────────
function WeatherCardView({ body, palette }: { body: string; palette: Palette }) {
  const w = parseWeather(body);
  const hasContent =
    Boolean(w.location || w.temp || w.condition || w.hi || w.lo) ||
    w.chips.length > 0 ||
    w.forecast.length > 0;
  if (!hasContent) return <pre className="rich-fallback">{body}</pre>;

  return (
    <div className="rich-weather">
      {w.location && (
        <div className="rich-weather-location" style={{ color: palette.heading }}>
          {w.location}
        </div>
      )}
      <div className="rich-weather-main">
        {w.condition && (
          <span className="rich-weather-icon" aria-hidden>
            {weatherIcon(w.condition)}
          </span>
        )}
        {w.temp && (
          <span className="rich-weather-temp" style={{ color: palette.assistant }}>
            {w.temp}
          </span>
        )}
        {w.condition && (
          <span className="rich-weather-condition" style={{ color: palette.muted }}>
            {w.condition}
          </span>
        )}
      </div>
      {(w.chips.length > 0 || w.hi || w.lo) && (
        <div className="rich-weather-chips">
          {w.hi && <span className="chip">hi {w.hi}</span>}
          {w.lo && <span className="chip">lo {w.lo}</span>}
          {w.chips.map((chip, i) => (
            <span key={i} className="chip">
              {chip.label ? `${chip.label} ` : ""}
              {chip.value}
            </span>
          ))}
        </div>
      )}
      {w.forecast.length > 0 && (
        <div className="rich-weather-forecast">
          {w.forecast.map((day, i) => (
            <div key={i} className="forecast-row">
              <span className="forecast-day" style={{ color: palette.muted }}>
                {day.day}
              </span>
              <span aria-hidden>{weatherIcon(day.cond)}</span>
              {day.hi && <span style={{ color: palette.assistant }}>{day.hi}</span>}
              {day.lo && <span style={{ color: palette.muted }}>{day.lo}</span>}
              {day.cond && (
                <span className="forecast-cond" style={{ color: palette.muted }}>
                  {day.cond}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Source cards ──────────────────────────────────────────────────────────────
function SourceCardsView({ body }: { body: string }) {
  const sources = parseSources(body);
  return <SourceList sources={sources} />;
}

// ── Router ────────────────────────────────────────────────────────────────────
export function RichBlockView({
  lang,
  body,
  palette,
}: {
  lang: string;
  body: string;
  palette: Palette;
}): React.ReactNode {
  const kind = richKind(lang);
  switch (kind) {
    case "bar":
      return <BarChart body={body} palette={palette} />;
    case "line":
      return <LineChart body={body} palette={palette} />;
    case "sparkline":
      return <LineChart body={body} palette={palette} spark />;
    case "pie":
      return <PieChartView body={body} palette={palette} />;
    case "weather":
      return <WeatherCardView body={body} palette={palette} />;
    case "sources":
      return <SourceCardsView body={body} />;
    default:
      return null;
  }
}

export { richKind };
export type { RichKind };
