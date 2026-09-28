import type {
  Language,
  PlaybackSpeed,
  FontPreset,
  SectionKey,
  Preferences,
  VisibilitySettings,
} from './types'

export const MAX_SCRIPT_LENGTH = 300
export const SPEEDS: PlaybackSpeed[] = ['1.0x', '0.8x', '0.6x', '0.4x', '0.2x']
export const PREFERENCE_KEY = 'nativecue-preferences-v2'

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  translation: true,
  definitions: true,
  etymology: true,
  examples: true,
  conjugation: true,
  wordIpa: true,
  sentenceIpa: true,
}

export const DEFAULT_PREFERENCES: Preferences = {
  backgroundColor: '#f6f3ec',
  brightness: 100,
  overlay: 86,
  fontPreset: 'sans',
  fontSize: 16,
  textColor: '#202124',
  ipaSize: 18,
  lineHeight: 1.55,
  visibility: DEFAULT_VISIBILITY,
}

export const FONT_STACKS: Record<FontPreset, string> = {
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  accessible: 'Arial, Verdana, sans-serif',
  mono: '"DM Mono", "SFMono-Regular", Consolas, monospace',
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  translation: 'Translation',
  definitions: 'Meanings',
  etymology: 'Etymology',
  examples: 'Examples',
  conjugation: 'Conjugation',
  wordIpa: 'Word-level IPA',
  sentenceIpa: 'Full-sentence IPA',
}

export function languageName(language: Language) {
  return language === 'EN' ? 'English' : 'Français'
}

export function languageLocale(language: Language) {
  return language === 'EN' ? 'en-US' : 'fr-FR'
}

export function partOfSpeechLabel(value?: string) {
  if (!value) return 'word'
  return value.replaceAll('_', ' ')
}

export function loadPreferences(): Preferences {
  try {
    const saved = localStorage.getItem(PREFERENCE_KEY)
    if (!saved) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(saved) as Partial<Preferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      visibility: Object.fromEntries(
        (Object.keys(DEFAULT_VISIBILITY) as SectionKey[]).map((key) => [
          key,
          typeof parsed.visibility?.[key] === 'boolean' ? parsed.visibility[key] : DEFAULT_VISIBILITY[key],
        ]),
      ) as VisibilitySettings,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}
