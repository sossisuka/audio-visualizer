"use client";

import {
  CircleNotchIcon,
  FlowerLotusIcon,
  SpiralIcon,
  HexagonIcon,
  GraphIcon,
  AsteriskIcon,
  MountainsIcon,
  DropIcon,
  DotsThreeIcon,
  WaveformIcon,
  PulseIcon,
  BroadcastIcon,
  type Icon,
} from "@phosphor-icons/react";
import { SCENES, type VisualMode } from "@/lib/visual-scenes";
import { FORMATIONS, type Formation } from "@/lib/constellation";
import {
  SYMBOL_FORMATIONS,
  isSymbolFormation,
} from "@/lib/constellation-symbols";

const ICONS: Record<VisualMode, Icon> = {
  Orbit: CircleNotchIcon,
  Senbonzakura: FlowerLotusIcon,
  Galaxy: SpiralIcon,
  Warp: HexagonIcon,
  Constellation: GraphIcon,
  Mandala: AsteriskIcon,
  Terrain: MountainsIcon,
  Rain: DropIcon,
  Particle: DotsThreeIcon,
  Wave: WaveformIcon,
  Beat: PulseIcon,
  Visual: BroadcastIcon,
};

export default function ScenePicker({
  value,
  onChange,
  formation,
  onFormationChange,
}: {
  value: VisualMode;
  onChange: (mode: VisualMode) => void;
  formation: Formation | "Auto";
  onFormationChange: (formation: Formation | "Auto") => void;
}) {
  return (
    <fieldset className="scene-picker">
      <legend className="section-caption">Scenes</legend>
      <div className="scene-grid">
        {SCENES.map((scene) => {
          const Icon = ICONS[scene.id];
          return (
            <label
              className="scene-choice"
              key={scene.id}
              title={scene.description}
            >
              <input
                type="radio"
                name="Display"
                value={scene.id}
                checked={value === scene.id}
                onChange={() => onChange(scene.id)}
              />
              <span className="scene-tile">
                <Icon size={20} weight="light" aria-hidden="true" />
                <span>{scene.name}</span>
              </span>
            </label>
          );
        })}
      </div>
      {value === "Constellation" && (
        <label className="formation-control">
          <span>Formation</span>
          <select
            aria-label="Constellation formation"
            value={formation}
            onChange={(event) =>
              onFormationChange(event.target.value as Formation | "Auto")
            }
          >
            <option value="Auto">Auto · follow the music</option>
            <optgroup label="Figures and logos">
              {SYMBOL_FORMATIONS.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </optgroup>
            <optgroup label="Geometric formations">
              {FORMATIONS.filter((name) => !isSymbolFormation(name)).map(
                (name) => (
                  <option key={name}>{name}</option>
                ),
              )}
            </optgroup>
          </select>
        </label>
      )}
    </fieldset>
  );
}
