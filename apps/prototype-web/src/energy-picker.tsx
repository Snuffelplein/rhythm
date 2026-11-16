import { Check } from 'lucide-react';
import './energy-picker.css';

export const energyLabels = ['Leeg', 'Weinig', 'Gemiddeld', 'Veel', 'Vol energie'];
const shortLabels = ['Leeg', 'Laag', 'Halfvol', 'Hoog', 'Vol'];

export function EnergyIcon({ level }: { level: number }) {
    return <svg className="energy-battery" viewBox="0 0 34 22" fill="none" aria-hidden="true">
        <rect x="1" y="3" width="28" height="16" rx="4" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="31" y="8" width="2.5" height="6" rx="1" fill="currentColor"/>
        {[0, 1, 2, 3].map(i => <rect key={i} x={4.5 + i * 5.7} y="6.5" width="4" height="9" rx="1" fill="currentColor" opacity={i < level - 1 ? 1 : .12}/>)}
    </svg>;
}

export function EnergyPicker({ value, onSelect }: { value?: number; onSelect: (level: number) => void }) {
    return <div className="energy-picker" role="group" aria-label="Kies je energie">
        {energyLabels.map((label, i) => {
            const level = i + 1, selected = value === level;
            return <button type="button" key={level} className={selected ? 'energy-choice selected' : 'energy-choice'} aria-label={`Energie ${level} van 5: ${label}`} aria-pressed={selected} onClick={() => onSelect(level)}>
                <span className="energy-choice-icon"><EnergyIcon level={level}/>{selected && <Check className="energy-choice-check" size={12} aria-hidden="true"/>}</span>
                <strong>{shortLabels[i]}</strong><span className="energy-choice-value">{level}</span>
            </button>;
        })}
    </div>;
}
