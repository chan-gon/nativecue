import { useRef, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { RotateCcw, Upload, X } from 'lucide-react'
import { DEFAULT_PREFERENCES, DEFAULT_VISIBILITY, SECTION_LABELS } from '../config'
import type { FontPreset, Preferences, SectionKey, VisibilitySettings } from '../types'

interface Props {
  preferences: Preferences
  setPreferences: Dispatch<SetStateAction<Preferences>>
  backgroundImage: string
  setBackgroundImage: (image: string) => void
  onClose: () => void
}

export default function Customizer({
  preferences,
  setPreferences,
  backgroundImage,
  setBackgroundImage,
  onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }))
  }

  const toggleSection = (key: SectionKey) => {
    setPreferences((current) => ({
      ...current,
      visibility: {
        ...current.visibility,
        [key]: !current.visibility[key],
      },
    }))
  }

  const setAllSections = (visible: boolean) => {
    setPreferences((current) => ({
      ...current,
      visibility: Object.fromEntries(
        Object.keys(DEFAULT_VISIBILITY).map((key) => [key, visible]),
      ) as VisibilitySettings,
    }))
  }

  const applyFocusMode = () => {
    setPreferences((current) => ({
      ...current,
      visibility: {
        ...Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map((key) => [key, false])),
        translation: true,
        definitions: true,
        wordIpa: true,
        sentenceIpa: true,
      } as VisibilitySettings,
    }))
  }

  const handleBackgroundImage = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setBackgroundImage(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className="customizer" role="dialog" aria-modal="true" aria-labelledby="customizer-title">
        <header className="customizer-header">
          <div>
            <span className="section-kicker">Preferences</span>
            <h2 id="customizer-title">Customize Nativecue</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => onClose()}
            aria-label="Close customization"
          >
            <X size={19} />
          </button>
        </header>

        <div className="customizer-content">
          <SettingsGroup title="Appearance">
            <div className="setting-row">
              <label htmlFor="background-color">Background color</label>
              <input
                id="background-color"
                type="color"
                value={preferences.backgroundColor}
                onChange={(event) => updatePreference('backgroundColor', event.target.value)}
              />
            </div>
            <div className="color-presets" aria-label="Background presets">
              {['#f6f3ec', '#f4f6f8', '#fff7f3', '#eef4f1', '#252729'].map((color) => (
                <button
                  type="button"
                  key={color}
                  style={{ background: color }}
                  className={preferences.backgroundColor === color ? 'active' : ''}
                  onClick={() => updatePreference('backgroundColor', color)}
                  aria-label={`Use ${color}`}
                />
              ))}
            </div>
            <div className="setting-row stacked">
              <div>
                <label htmlFor="background-image">Background image</label>
                <small>Use a calm image that keeps text readable.</small>
              </div>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={15} /> Upload
                </button>
                {backgroundImage && (
                  <button className="text-button" type="button" onClick={() => setBackgroundImage('')}>
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                id="background-image"
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(event) => handleBackgroundImage(event.target.files?.[0])}
              />
            </div>
            <RangeSetting
              label="Background brightness"
              value={preferences.brightness}
              min={35}
              max={120}
              suffix="%"
              onChange={(value) => updatePreference('brightness', value)}
            />
            <RangeSetting
              label="Content backdrop"
              value={preferences.overlay}
              min={55}
              max={100}
              suffix="%"
              onChange={(value) => updatePreference('overlay', value)}
            />
          </SettingsGroup>

          <SettingsGroup title="Typography">
            <label className="select-setting">
              Font family
              <select
                value={preferences.fontPreset}
                onChange={(event) => updatePreference('fontPreset', event.target.value as FontPreset)}
              >
                <option value="sans">Modern Sans</option>
                <option value="serif">Editorial Serif</option>
                <option value="accessible">Accessible Sans</option>
                <option value="mono">Monospace Study Mode</option>
              </select>
            </label>
            <RangeSetting
              label="Text size"
              value={preferences.fontSize}
              min={14}
              max={22}
              suffix="px"
              onChange={(value) => updatePreference('fontSize', value)}
            />
            <RangeSetting
              label="IPA size"
              value={preferences.ipaSize}
              min={14}
              max={26}
              suffix="px"
              onChange={(value) => updatePreference('ipaSize', value)}
            />
            <RangeSetting
              label="Line height"
              value={preferences.lineHeight}
              min={1.3}
              max={2}
              step={0.05}
              onChange={(value) => updatePreference('lineHeight', value)}
            />
            <div className="setting-row">
              <label htmlFor="text-color">Text color</label>
              <input
                id="text-color"
                type="color"
                value={preferences.textColor}
                onChange={(event) => updatePreference('textColor', event.target.value)}
              />
            </div>
          </SettingsGroup>

          <SettingsGroup title="Content visibility">
            <div className="preset-actions">
              <button type="button" onClick={() => setAllSections(true)}>
                Show all
              </button>
              <button type="button" onClick={applyFocusMode}>
                Focus mode
              </button>
            </div>
            <div className="toggle-list">
              {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => (
                <label className="toggle-row" key={key}>
                  <span>{SECTION_LABELS[key]}</span>
                  <input
                    type="checkbox"
                    checked={preferences.visibility[key]}
                    onChange={() => toggleSection(key)}
                  />
                  <span className="toggle-track">
                    <span />
                  </span>
                </label>
              ))}
            </div>
          </SettingsGroup>
        </div>

        <footer className="customizer-footer">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setPreferences(DEFAULT_PREFERENCES)
              setBackgroundImage('')
            }}
          >
            <RotateCcw size={15} /> Reset to default
          </button>
          <button className="primary-button" type="button" onClick={() => onClose()}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="range-setting">
      <span>
        <span>{label}</span>
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
