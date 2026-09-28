export type Language = 'EN' | 'FR'
export type PlaybackSpeed = '1.0x' | '0.8x' | '0.6x' | '0.4x' | '0.2x'
export type FontPreset = 'sans' | 'serif' | 'accessible' | 'mono'
export type SectionKey =
  'translation' | 'definitions' | 'etymology' | 'examples' | 'conjugation' | 'wordIpa' | 'sentenceIpa'

export interface AnalyzedWord {
  text: string
  ipa: string
  lemma?: string
  part_of_speech?: string
}

export interface AnalyzeResponse {
  text: string
  language: string
  ipa: string
  words: AnalyzedWord[]
}

export interface TranslationResponse {
  text?: string
  translation: string
  source_language: string
  target_language: string
}

export interface Definition {
  meaning: string
  translation?: string
  register?: string
  examples?: Example[]
}

export interface Example {
  sentence: string
  translation: string
}

export interface ConjugatedForm {
  subject: string
  form: string
  ipa?: string
}

export interface ConjugationGroup {
  tense: string
  forms: ConjugatedForm[]
}

export interface VerbDetails {
  groups: ConjugationGroup[]
  present_participle?: string
  present_participle_ipa?: string
  past_participle?: string
  past_participle_ipa?: string
}

export interface DictionaryEntry {
  id: string
  source_word: string
  lemma: string
  language: string
  part_of_speech: string
  ipa: string
  gender?: string
  inflection?: string
  definitions: Definition[]
  etymology?: string
  examples: Example[]
  verb?: VerbDetails
}

export interface DictionaryResponse {
  entries: DictionaryEntry[]
}

export type VisibilitySettings = Record<SectionKey, boolean>

export interface Preferences {
  backgroundColor: string
  brightness: number
  overlay: number
  fontPreset: FontPreset
  fontSize: number
  textColor: string
  ipaSize: number
  lineHeight: number
  visibility: VisibilitySettings
}

export type Speak = (text: string, key: string, language?: Language) => void
