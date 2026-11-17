import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { curvePoints, glucoseAtMinute, type SimilarMealsResponse } from "@/lib/meal-comparison";
import type { Snapshot } from "@/components/glucose/meal-glucose-chart";
import { comparisonDomain } from "@/lib/meal-workflow";
import styles from "./home-workflow.module.css";

export const HISTORY_COLORS = ["#3b82f6", "#a855f7", "#16a085"];
export function HistoricalGlucoseChart({ history, selected, current }: { history: SimilarMealsResponse | null; selected: number; current: Snapshot | null }) {
  // All curves contribute to the domain, so selecting a record never moves the axes.
  const domain = useMemo(() => comparisonDomain(history, current), [history, current]);
  const series = useMemo(() => history?.matches.map((match, index) => ({
    id: match.meal.id, name: match.meal.name, points: curvePoints(match.snapshot).filter((p) => p.minute >= -60 && p.minute <= 120), color: HISTORY_COLORS[index % HISTORY_COLORS.length],
  })) ?? [], [history]);
  const currentPoints = useMemo(() => current ? curvePoints(current).filter((p) => p.minute >= -60 && p.minute <= 120) : [], [current]);
  const focused = history?.matches[selected];
  const markers = [
    ...(current ? current.injections.map((event) => ({ ...event, snapshot: current, color: "var(--foreground)", source: "This meal", curveId: "current", points: currentPoints })) : []),
    ...(focused ? focused.snapshot.injections.map((event) => ({ ...event, snapshot: focused.snapshot, color: HISTORY_COLORS[selected % HISTORY_COLORS.length], source: focused.meal.name, curveId: focused.meal.id, points: series[selected].points })) : []),
  ].flatMap((event) => {
    const minute = (Date.parse(event.injected_at) - Date.parse(event.snapshot.window.meal_time)) / 60000;
    const glucose = glucoseAtMinute(event.points, minute);
    return minute >= -60 && minute <= 120 && glucose !== null ? [{ ...event, minute, glucose }] : [];
  });
  return <div className="h-full w-full" role="img" aria-label={`Glucose from 60 minutes before to 120 minutes after eating. This meal uses a dark line in light mode, a light line in dark mode, including available readings through 120 minutes after eating. ${series[selected]?.name ? `${series[selected].name} highlighted.` : "Historical curves are muted; scroll to explore."} ${markers.length ? `Recorded insulin: ${markers.map((event) => `${event.source}, ${event.dose_units} units, ${Math.round(event.minute)} minutes from eating`).join("; ")}.` : "No insulin markers in this window."} Values in milligrams per decilitre.`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={[{ minute: -60 }, { minute: 120 }]} margin={{ top: 22, right: 20, left: 0, bottom: 20 }} accessibilityLayer>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="minute" type="number" domain={[-60, 120]} ticks={[-60, -30, 0, 30, 60, 90, 120]} allowDataOverflow tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: "Minutes from eating", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--muted-foreground)" }} />
        <YAxis width={44} type="number" domain={domain} allowDataOverflow tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} label={{ value: "mg/dL", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--muted-foreground)" }} />
        <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Meal", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />
        {series.map((line, index) => <Line key={line.id} className={styles.line} data={line.points} dataKey="glucose" name={line.name} type="linear" stroke={line.color} strokeWidth={index === selected ? 2.5 : 1.5} strokeOpacity={index === selected ? 0.9 : 0.18} dot={{ r: 1.5, fill: line.color, strokeWidth: 0, opacity: index === selected ? 0.9 : 0.18 }} connectNulls={false} isAnimationActive={false} />)}
        <Line zIndex={500} className={styles.currentLine} data={currentPoints} dataKey="glucose" name="This meal" type="linear" stroke="var(--foreground)" strokeWidth={3} strokeOpacity={1} dot={{ r: 2, fill: "var(--foreground)", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
        {markers.map((event) => <ReferenceDot key={`${event.curveId}-${event.id}`} x={event.minute} y={event.glucose} r={7} zIndex={600}
          shape={({ cx, cy }) => <g className="insulin-marker" data-curve-id={event.curveId} data-injection-id={event.id}>
            <title>{`${event.source}: ${event.dose_units} U insulin at ${new Date(event.injected_at).toLocaleString()}`}</title>
            <circle cx={cx} cy={cy} r={7} fill="var(--card)" stroke={event.color} strokeWidth={1.25} />
            <circle cx={cx} cy={cy} r={3} fill={event.color} />
          </g>}
          label={{ value: `${event.dose_units} U`, position: event.minute < -45 ? "right" : event.minute > 105 ? "left" : "top", offset: 10, fill: event.color, fontSize: 10 }} />)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
