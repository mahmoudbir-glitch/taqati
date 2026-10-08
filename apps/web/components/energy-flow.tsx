"use client";

import { BatteryCharging, BatteryMedium, House, Sun, UtilityPole, type LucideIcon } from "lucide-react";
import { batteryState } from "../lib/energy";
import { amps, kw, THRESHOLD_W } from "../lib/format";
import type { Reading } from "../lib/types";

type FlowNode = { key: string; label: string; value: string; sub?: string; color: string; x: number; y: number; icon: LucideIcon; above?: boolean };

const ICON_SIZE = 26;

/** Live diagram of power moving between sun, grid, home and battery through the inverter. */
export function EnergyFlow({ reading }: { reading: Reading }) {
  const { solarW, loadW, gridW, batteryW } = reading;
  const state = batteryState(reading);
  const importing = gridW > THRESHOLD_W;
  const exporting = gridW < -THRESHOLD_W;
  const gridActive = importing || exporting;
  const gridV = reading.gridV ?? 0;
  const gridA = gridV > 0 ? Math.abs(gridW) / gridV : 0;
  const loadA = gridV > 0 ? loadW / gridV : 0;
  const batteryA = Math.abs(reading.batteryA ?? 0);

  const nodes: FlowNode[] = [
    { key: "solar", label: "الشمس", value: kw(solarW), color: "var(--solar)", x: 200, y: 96, icon: Sun, above: true },
    {
      key: "grid",
      label: "الشبكة",
      value: gridActive ? kw(gridW) : "غير مستخدمة",
      sub: gridActive && gridA > 0.05 ? amps(gridA) : undefined,
      color: "var(--grid)",
      x: 60,
      y: 216,
      icon: UtilityPole,
    },
    { key: "home", label: "المنزل", value: kw(loadW), sub: loadA > 0.05 ? amps(loadA) : undefined, color: "var(--home)", x: 340, y: 216, icon: House },
    {
      key: "battery",
      label: state === "charging" ? "البطارية • تشحن" : state === "discharging" ? "البطارية • تفرغ" : "البطارية",
      value: reading.soc === null ? "—" : `${Math.round(reading.soc)}%`,
      sub: state !== "idle" ? (batteryA > 0.05 ? `${amps(batteryA)} · ${kw(batteryW)}` : kw(batteryW)) : undefined,
      color: "var(--battery)",
      x: 200,
      y: 336,
      icon: state === "charging" ? BatteryCharging : BatteryMedium,
    },
  ];

  // Each path is drawn in the direction the power moves so the dashes animate that way.
  const spokes = [
    { key: "solar", active: solarW > THRESHOLD_W, color: "var(--solar)", d: "M200 130 L200 182" },
    { key: "grid", active: gridActive, color: "var(--grid)", d: exporting ? "M166 216 L94 216" : "M94 216 L166 216" },
    { key: "home", active: loadW > THRESHOLD_W, color: "var(--home)", d: "M234 216 L306 216" },
    { key: "battery", active: state !== "idle", color: "var(--battery)", d: state === "charging" ? "M200 250 L200 302" : "M200 302 L200 250" },
  ];

  return (
    <svg className="flow" viewBox="0 0 400 440" role="img" aria-label="مخطط تدفق الطاقة بين الشمس والشبكة والمنزل والبطارية">
      {spokes.map((spoke) => (
        <path
          key={spoke.key}
          d={spoke.d}
          stroke={spoke.active ? spoke.color : "var(--border)"}
          strokeWidth={spoke.active ? 3 : 2}
          strokeDasharray={spoke.active ? "6 5" : "2 6"}
          strokeLinecap="round"
          fill="none"
        >
          {spoke.active && <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite" />}
        </path>
      ))}
      <circle cx="200" cy="216" r="34" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      <text x="200" y="221" textAnchor="middle" fill="var(--accent-ink)" fontSize="13" fontWeight="600">إنفرتر</text>
      {nodes.map((node) => {
        const Icon = node.icon;
        const labelY = node.above ? node.y - 44 - (node.sub ? 34 : 18) : node.y + 52;
        return (
          <g key={node.key}>
            <circle cx={node.x} cy={node.y} r="34" fill="var(--surface)" stroke={node.color} strokeWidth="2.5" />
            <Icon x={node.x - ICON_SIZE / 2} y={node.y - ICON_SIZE / 2} width={ICON_SIZE} height={ICON_SIZE} color={node.color} aria-hidden />
            <text x={node.x} y={labelY} textAnchor="middle" fontSize="12" fill="var(--muted)">{node.label}</text>
            <text x={node.x} y={labelY + 18} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--foreground)" direction={/\d/.test(node.value) ? "ltr" : undefined}>
              {node.value}
            </text>
            {node.sub && (
              <text x={node.x} y={labelY + 34} textAnchor="middle" fontSize="11" fill="var(--muted)" direction="ltr">{node.sub}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
