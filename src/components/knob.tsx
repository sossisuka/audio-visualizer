"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

interface KnobProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  large?: boolean;
  minLabel?: string;
  maxLabel?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export default function Knob({
  label,
  value,
  onChange,
  large,
  minLabel = "0",
  maxLabel = "100",
}: KnobProps) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    if (event.key in steps) {
      event.preventDefault();
      onChange(clamp(value + steps[event.key] * (event.shiftKey ? 5 : 1)));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onChange(event.key === "Home" ? 0 : 100);
    }
  }

  return (
    <div className={`knob-control ${large ? "knob-control--large" : ""}`}>
      <div
        className={`knob ${dragging ? "is-dragging" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={label.charAt(0).toUpperCase() + label.slice(1)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} percent`}
        title={`${label}: ${value} · drag up or down · double-click to reset`}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onChange(50)}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, value };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            onChange(
              clamp(
                drag.current.value + (drag.current.y - event.clientY) * 0.65,
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <div className="knob-ticks" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => (
            <i
              key={i}
              className={i % 6 === 0 ? "major" : ""}
              style={
                { "--tick-angle": `${-135 + i * 11.25}deg` } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="knob-base" aria-hidden="true">
          <div className="knob-face">
            <div
              className="knob-rotor"
              style={{ transform: `rotate(${(value - 50) * 2.7}deg)` }}
            >
              <span />
            </div>
          </div>
        </div>
        <span className="knob-value" aria-hidden="true">
          {value}
        </span>
      </div>
      <div className="knob-extents" aria-hidden="true">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
      <span className="control-label">{label}</span>
    </div>
  );
}
