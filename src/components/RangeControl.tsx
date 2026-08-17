interface RangeControlProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  output: string
  onInput: (value: number) => void
  onBegin: () => void
  onEnd: () => void
}

export function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  output,
  onInput,
  onBegin,
  onEnd,
}: RangeControlProps) {
  return (
    <div class="range-control">
      <div class="range-row">
        <label for={id}>{label}</label>
        <output for={id}>{output}</output>
      </div>
      <input
        id={id}
        class="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onBegin}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onKeyDown={onBegin}
        onKeyUp={onEnd}
        onInput={(event) => onInput(Number((event.currentTarget as HTMLInputElement).value))}
      />
    </div>
  )
}
