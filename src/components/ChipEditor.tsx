import { useState } from 'react'
import { CloseIcon, PlusIcon } from './Icons'

interface Props {
  label: string
  values: string[]
  suggestions: string[]
  placeholder: string
  onChange: (values: string[]) => void
}

const keyOf = (value: string) => value.trim().toLocaleLowerCase()

export function ChipEditor({ label, values, suggestions, placeholder, onChange }: Props) {
  const [input, setInput] = useState('')
  const selectedKeys = new Set(values.map(keyOf))
  const available = suggestions.filter((suggestion) => !selectedKeys.has(keyOf(suggestion))).slice(0, 8)

  const add = (rawValue = input) => {
    const value = rawValue.trim().replace(/\s+/g, ' ')
    if (value && !selectedKeys.has(keyOf(value))) onChange([...values, value])
    setInput('')
  }

  return <div className="chip-editor">
    <span className="field-label">{label}</span>
    {values.length > 0 && <div className="selected-chips">
      {values.map((value) => <button type="button" key={value} onClick={() => onChange(values.filter((item) => item !== value))}>{value}<CloseIcon size={15} /></button>)}
    </div>}
    <div className="chip-input-row">
      <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add() }
      }} placeholder={placeholder} aria-label={`Add ${label.toLowerCase()}`} />
      <button type="button" onClick={() => add()} aria-label={`Add ${label.toLowerCase()}`} disabled={!input.trim()}><PlusIcon size={19} /></button>
    </div>
    {available.length > 0 && <div className="suggestion-row" aria-label={`${label} suggestions`}>
      {available.map((suggestion) => <button type="button" key={suggestion} onClick={() => add(suggestion)}>+ {suggestion}</button>)}
    </div>}
  </div>
}
