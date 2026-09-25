import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  Volume2,
  X,
} from 'lucide-react'
import './App.css'

type Language = 'EN' | 'FR'
type PlaybackSpeed = '1.0x' | '0.8x' | '0.6x' | '0.4x' | '0.2x'
type FontPreset = 'sans' | 'serif' | 'accessible' | 'mono'
type SectionKey =
  | 'translation'
  | 'definitions'
  | 'etymology'
  | 'examples'
  | 'conjugation'
  | 'wordIpa'
  | 'sentenceIpa'

interface AnalyzedWord {
  text: string
  ipa: string
  lemma?: string
  part_of_speech?: string
}

interface AnalyzeResponse {
  text: string
  language: string
  ipa: string
  words: AnalyzedWord[]
}

interface TranslationResponse {
  text?: string
  translation: string
  source_language: string
  target_language: string
}

interface Definition {
  meaning: string
  translation?: string
  register?: string
  examples?: Example[]
}

interface Example {
  sentence: string
  translation: string
}

interface ConjugatedForm {
  subject: string
  form: string
  ipa?: string
}

interface ConjugationGroup {
  tense: string
  forms: ConjugatedForm[]
}

interface VerbDetails {
  groups: ConjugationGroup[]
  present_participle?: string
  present_participle_ipa?: string
  past_participle?: string
  past_participle_ipa?: string
}

interface DictionaryEntry {
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

interface DictionaryResponse {
  entries: DictionaryEntry[]
}

interface VisibilitySettings extends Record<SectionKey, boolean> {}

interface Preferences {
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

const API_BASE_URL = 'http://localhost:8000'
const MAX_SCRIPT_LENGTH = 300
const SPEEDS: PlaybackSpeed[] = ['1.0x', '0.8x', '0.6x', '0.4x', '0.2x']
const PREFERENCE_KEY = 'nativecue-preferences-v2'

const DEFAULT_VISIBILITY: VisibilitySettings = {
  translation: true,
  definitions: true,
  etymology: true,
  examples: true,
  conjugation: true,
  wordIpa: true,
  sentenceIpa: true,
}

const DEFAULT_PREFERENCES: Preferences = {
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

const FONT_STACKS: Record<FontPreset, string> = {
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  accessible: 'Arial, Verdana, sans-serif',
  mono: '"DM Mono", "SFMono-Regular", Consolas, monospace',
}

const SECTION_LABELS: Record<SectionKey, string> = {
  translation: 'Translation',
  definitions: 'Meanings',
  etymology: 'Etymology',
  examples: 'Examples',
  conjugation: 'Conjugation',
  wordIpa: 'Word-level IPA',
  sentenceIpa: 'Full-sentence IPA',
}

function languageName(language: Language) {
  return language === 'EN' ? 'English' : 'Français'
}

function languageLocale(language: Language) {
  return language === 'EN' ? 'en-US' : 'fr-FR'
}

function partOfSpeechLabel(value?: string) {
  if (!value) return 'word'
  return value.replaceAll('_', ' ')
}

function subjectNames(language: string): string[] {
  return language.toLowerCase() === 'fr'
    ? ['je', 'tu', 'il / elle / on', 'nous', 'vous', 'ils / elles']
    : ['I', 'you', 'he / she / it', 'we', 'you', 'they']
}

// Slots preserve person AND number (including the two English "you" rows).
function subjectSlots(subject: string, language: string): number[] {
  const value = subject.trim().toLowerCase().replaceAll('’', "'")
  const persons = ['first-person', 'second-person', 'third-person']
    .map((tag, index) => value.includes(tag) ? index : -1).filter(index => index >= 0)
  const numbers = ['singular', 'plural'].filter(tag => value.includes(tag))
  if (persons.length && numbers.length) {
    return numbers.flatMap(number => persons.map(person => person + (number === 'plural' ? 3 : 0)))
  }
  const direct: Record<string, number[]> = language.toLowerCase() === 'fr'
    ? { je: [0], "j'": [0], tu: [1], il: [2], elle: [2], on: [2],
        nous: [3], vous: [4], ils: [5], elles: [5],
        'il/elle/on': [2], 'il/elle': [2], 'ils/elles': [5] }
    : { i: [0], you: [1, 4], he: [2], she: [2], it: [2], we: [3], they: [5], 'he/she/it': [2] }
  return direct[value.replace(/^(?:que\s+|qu')/, '').replaceAll(' ', '')] ?? []
}

function subjectLabel(subject: string, language: string): string | null {
  const names = subjectNames(language)
  return [...new Set(subjectSlots(subject, language).map(slot => names[slot]))].join(' / ') || null
}

function finiteConjugations(entry: DictionaryEntry | null): ConjugationGroup[] {
  if (!entry) return []
  const groups = new Map<string, { tense: string; subjects: Map<number, Map<string, Set<string>>> }>()
  for (const group of entry.verb?.groups ?? []) {
    if (/infinitive|participle|gerund|infinitif|participe|gérondif/i.test(group.tense)) continue
    // Merge identical tag sets even if the backend returns tags in another order.
    const key = group.tense.toLowerCase().split('·').map(tag => tag.trim()).sort().join('|')
    const merged = groups.get(key) ?? { tense: group.tense, subjects: new Map<number, Map<string, Set<string>>>() }
    for (const form of group.forms) {
      const value = form.form.normalize('NFC').trim().replace(/\s+/g, ' ')
      if (!value || !subjectLabel(form.subject, entry.language)) continue
      for (const slot of subjectSlots(form.subject, entry.language)) {
        const variants = merged.subjects.get(slot) ?? new Map<string, Set<string>>()
        const ipas = variants.get(value) ?? new Set<string>()
        if (form.ipa) ipas.add(form.ipa)
        variants.set(value, ipas)
        merged.subjects.set(slot, variants)
      }
    }
    groups.set(key, merged)
  }
  const names = subjectNames(entry.language)
  return [...groups.values()].flatMap(group => {
    const forms = [...group.subjects.entries()]
      .sort(([left], [right]) => left - right)
      .map(([slot, variants]) => ({
        subject: names[slot],
        form: [...variants.keys()].join(', '),
        ipa: [...variants.values()].flatMap(ipa => [...ipa]).join(' / '),
      }))
    return forms.length ? [{ tense: group.tense, forms }] : []
  })
}

interface ConjugationSection {
  mood: string
  groups: Array<ConjugationGroup & { label: string; order: number }>
}

function organizeConjugations(entry: DictionaryEntry | null): ConjugationSection[] {
  const sections = new Map<string, ConjugationSection>()
  for (const group of finiteConjugations(entry)) {
    const tags = new Set(group.tense.toLowerCase().split('·').map(tag => tag.trim()))
    const mood = tags.has('indicative') ? 'Indicative'
      : tags.has('subjunctive') ? 'Subjunctive'
      : tags.has('conditional') ? 'Conditional'
      : tags.has('imperative') ? 'Imperative' : 'Other forms'
    const label = tags.has('anterior') ? 'Passé antérieur'
      : tags.has('historic') && tags.has('past') ? 'Passé simple'
      : tags.has('pluperfect') ? 'Plus-que-parfait'
      : tags.has('future') && tags.has('perfect') ? 'Futur antérieur'
      : tags.has('conditional') && tags.has('perfect') ? 'Passé'
      : tags.has('imperfect') ? 'Imparfait'
      : tags.has('future') ? 'Futur simple'
      : tags.has('perfect') && tags.has('present') ? 'Passé composé'
      : tags.has('past') ? 'Passé' : tags.has('present') ? 'Présent' : group.tense.replaceAll(' · ', ' — ')
    const order = tags.has('present') ? 10
      : tags.has('imperfect') || tags.has('pluperfect') ? 20
      : tags.has('past') || tags.has('anterior') ? 30
      : tags.has('future') ? 40 : 50
    const section = sections.get(mood) ?? { mood, groups: [] }
    section.groups.push({ ...group, label, order })
    sections.set(mood, section)
  }
  const moodOrder = ['Indicative', 'Subjunctive', 'Conditional', 'Imperative', 'Other forms']
  return [...sections.values()]
    .map(section => ({ ...section, groups: section.groups.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)) }))
    .sort((a, b) => moodOrder.indexOf(a.mood) - moodOrder.indexOf(b.mood))
}

async function requestJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `${path} failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

function loadPreferences(): Preferences {
  try {
    const saved = localStorage.getItem(PREFERENCE_KEY)
    if (!saved) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(saved) as Partial<Preferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      visibility: Object.fromEntries(
        (Object.keys(DEFAULT_VISIBILITY) as SectionKey[]).map(key => [
          key,
          typeof parsed.visibility?.[key] === 'boolean'
            ? parsed.visibility[key]
            : DEFAULT_VISIBILITY[key],
        ]),
      ) as VisibilitySettings,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function App() {
  const [sourceLanguage, setSourceLanguage] = useState<Language>('EN')
  const [targetLanguage, setTargetLanguage] = useState<Language>('FR')
  const [inputText, setInputText] = useState('')
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null)
  const [translation, setTranslation] = useState<TranslationResponse | null>(null)
  const [entries, setEntries] = useState<DictionaryEntry[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [speed, setSpeed] = useState<PlaybackSpeed>('1.0x')
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [backgroundImage, setBackgroundImage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedEntry = useMemo(
    () => entries.find(entry => entry.id === selectedEntryId) ?? entries[0] ?? null,
    [entries, selectedEntryId],
  )

  const conjugationSections = useMemo(() => organizeConjugations(selectedEntry), [selectedEntry])

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences))
    } catch {
      // The interface still works when browser storage is unavailable.
    }
  }, [preferences])

  useEffect(() => () => window.speechSynthesis.cancel(), [])

  const appStyle = {
    '--app-background': preferences.backgroundColor,
    '--app-text': preferences.textColor,
    '--app-font-size': `${preferences.fontSize}px`,
    '--app-line-height': String(preferences.lineHeight),
    '--ipa-size': `${preferences.ipaSize}px`,
    '--app-font-family': FONT_STACKS[preferences.fontPreset],
    '--background-brightness': `${preferences.brightness}%`,
    '--surface-opacity': String(preferences.overlay / 100),
    '--background-image': backgroundImage ? `url("${backgroundImage}")` : 'none',
  } as CSSProperties

  const resetResults = () => {
    window.speechSynthesis.cancel()
    setAnalysis(null)
    setTranslation(null)
    setEntries([])
    setSelectedEntryId(null)
    setPlayingKey(null)
    setErrors({})
  }

  const resetApp = () => {
    resetResults()
    setInputText('')
    setSourceLanguage('EN')
    setTargetLanguage('FR')
    setSpeed('1.0x')
    window.history.replaceState({}, '', '/')
  }

  const speak = useCallback((text: string, key: string, language = sourceLanguage) => {
    if (!text.trim()) return

    if (playingKey === key) {
      window.speechSynthesis.cancel()
      setPlayingKey(null)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = languageLocale(language)
    utterance.rate = Number.parseFloat(speed)
    utterance.onstart = () => setPlayingKey(key)
    utterance.onend = () => setPlayingKey(null)
    utterance.onerror = () => setPlayingKey(null)
    window.speechSynthesis.speak(utterance)
  }, [playingKey, sourceLanguage, speed])

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isLoading) return

    window.speechSynthesis.cancel()
    setIsLoading(true)
    setErrors({})
    setAnalysis(null)
    setTranslation(null)
    setEntries([])
    setSelectedEntryId(null)

    const language = sourceLanguage.toLowerCase()
    const target = targetLanguage.toLowerCase()
    const [analysisResult, translationResult, dictionaryResult] = await Promise.allSettled([
      requestJson<AnalyzeResponse>('/analyze', { text, language }),
      requestJson<TranslationResponse>('/translate', {
        text,
        source_language: language,
        target_language: target,
      }),
      requestJson<DictionaryResponse>('/dictionary', {
        text,
        language,
        target_language: target,
      }),
    ])

    const nextErrors: Record<string, string> = {}

    if (analysisResult.status === 'fulfilled') {
      setAnalysis(analysisResult.value)
      speak(analysisResult.value.text, 'sentence', sourceLanguage)
    } else {
      nextErrors.pronunciation = 'Pronunciation and IPA could not be loaded.'
    }

    if (translationResult.status === 'fulfilled') {
      setTranslation(translationResult.value)
    } else {
      nextErrors.translation = 'Translation could not be loaded.'
    }

    if (dictionaryResult.status === 'fulfilled') {
      const nextEntries = dictionaryResult.value.entries ?? []
      setEntries(nextEntries)
      setSelectedEntryId(nextEntries[0]?.id ?? null)
    } else {
      nextErrors.dictionary = 'Dictionary information could not be loaded.'
    }

    setErrors(nextErrors)
    setIsLoading(false)
  }, [inputText, isLoading, sourceLanguage, targetLanguage, speak])

  const swapLanguages = () => {
    const nextSource = targetLanguage
    setSourceLanguage(nextSource)
    setTargetLanguage(sourceLanguage)

    if (translation?.translation) {
      setInputText(translation.translation)
    }

    resetResults()
  }

  const copyTranslation = async () => {
    if (!translation?.translation) return
    await navigator.clipboard.writeText(translation.translation)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(current => ({ ...current, [key]: value }))
  }

  const toggleSection = (key: SectionKey) => {
    setPreferences(current => ({
      ...current,
      visibility: {
        ...current.visibility,
        [key]: !current.visibility[key],
      },
    }))
  }

  const setAllSections = (visible: boolean) => {
    setPreferences(current => ({
      ...current,
      visibility: Object.fromEntries(
        Object.keys(DEFAULT_VISIBILITY).map(key => [key, visible]),
      ) as VisibilitySettings,
    }))
  }

  const applyFocusMode = () => {
    setPreferences(current => ({
      ...current,
      visibility: {
        ...Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map(key => [key, false])),
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

  const selectEntry = (entry: DictionaryEntry) => {
    setSelectedEntryId(entry.id)
    speak(entry.source_word, `word-${entry.id}`, sourceLanguage)
  }

  return (
    <div className="app" style={appStyle}>
      <div className="background-layer" aria-hidden="true" />

      <nav className="navbar" aria-label="Main navigation">
        <button className="brand" type="button" onClick={resetApp} aria-label="Reset Nativecue">
          <span className="logo-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 17V10Q9 6 13 6Q17 6 17 10V17" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".45" />
              <path d="M7 17V10Q7 6 11 6Q15 6 15 10V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="logo-text">nativecue</span>
        </button>

        <p className="nav-tagline">Understand every word. Say every sentence.</p>

        <div className="nav-actions">
          <div className="language-summary" aria-label="Translation direction">
            <span>{sourceLanguage}</span>
            <ArrowLeftRight size={13} />
            <span>{targetLanguage}</span>
          </div>
          <button
            className="icon-button nav-customize"
            type="button"
            onClick={() => setIsCustomizerOpen(true)}
            aria-label="Customize appearance and content"
          >
            <SlidersHorizontal size={18} />
            <span>Customize</span>
          </button>
        </div>
      </nav>

      <main className="main">
        <section className={`translator-card ${!preferences.visibility.translation ? 'translation-hidden' : ''}`}>
          <div className="translator-panel source-panel">
            <div className="panel-toolbar">
              <label className="language-select-label">
                <span>From</span>
                <select
                  value={sourceLanguage}
                  onChange={event => {
                    const next = event.target.value as Language
                    setSourceLanguage(next)
                    setTargetLanguage(next === 'EN' ? 'FR' : 'EN')
                    resetResults()
                  }}
                >
                  <option value="EN">English</option>
                  <option value="FR">Français</option>
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
              <span className="character-count">{inputText.length}/{MAX_SCRIPT_LENGTH}</span>
            </div>

            <div className="input-wrap">
              <textarea
                className="sentence-input"
                value={inputText}
                maxLength={MAX_SCRIPT_LENGTH}
                rows={5}
                onChange={event => setInputText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder={sourceLanguage === 'EN'
                  ? 'Type a sentence you want to understand and pronounce…'
                  : 'Saisissez une phrase que vous souhaitez comprendre et prononcer…'}
              />
              {inputText && (
                <button
                  className="clear-button"
                  type="button"
                  onClick={() => {
                    setInputText('')
                    resetResults()
                  }}
                  aria-label="Clear sentence"
                >
                  <X size={17} />
                </button>
              )}
            </div>

            <div className="composer-footer">
              <span className="keyboard-hint">Enter to pronounce · Shift + Enter for a new line</span>
              <button
                className="primary-button"
                type="button"
                disabled={!inputText.trim() || isLoading}
                onClick={() => void handleSubmit()}
              >
                {isLoading ? <span className="spinner" /> : <Volume2 size={18} />}
                {isLoading ? 'Loading…' : 'Pronounce'}
              </button>
            </div>
          </div>

          {preferences.visibility.translation && (
            <>
              <button className="swap-button" type="button" onClick={swapLanguages} aria-label="Swap translation languages">
                <ArrowLeftRight size={17} />
              </button>

              <div className="translator-panel target-panel">
                <div className="panel-toolbar">
                  <label className="language-select-label">
                    <span>To</span>
                    <select
                      value={targetLanguage}
                      onChange={event => {
                        const next = event.target.value as Language
                        setTargetLanguage(next)
                        setSourceLanguage(next === 'EN' ? 'FR' : 'EN')
                        resetResults()
                      }}
                    >
                      <option value="FR">Français</option>
                      <option value="EN">English</option>
                    </select>
                    <ChevronDown size={14} aria-hidden="true" />
                  </label>
                  {translation?.translation && (
                    <div className="inline-actions">
                      <button className="small-icon-button" type="button" onClick={() => speak(translation.translation, 'translation', targetLanguage)} aria-label="Play translation">
                        {playingKey === 'translation' ? <Pause size={16} /> : <Volume2 size={16} />}
                      </button>
                      <button className="small-icon-button" type="button" onClick={() => void copyTranslation()} aria-label="Copy translation">
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  )}
                </div>

                <div className={`translation-output ${translation?.translation ? 'has-result' : ''}`}>
                  {isLoading ? (
                    <div className="module-loading"><span className="spinner dark" /> Translating…</div>
                  ) : translation?.translation ? (
                    <p>{translation.translation}</p>
                  ) : (
                    <p className="empty-copy">Your translation will appear here.</p>
                  )}
                </div>

                {errors.translation && <p className="inline-error">{errors.translation}</p>}
              </div>
            </>
          )}
        </section>

        {(analysis || isLoading || errors.pronunciation) && (
          <section className="result-card pronunciation-card">
            <div className="section-header">
              <div>
                <span className="section-kicker">Pronunciation</span>
                <h1>{analysis?.text || inputText}</h1>
                {preferences.visibility.sentenceIpa && analysis?.ipa && <p className="sentence-ipa">{analysis.ipa}</p>}
              </div>
              {analysis && (
                <div className="pronunciation-actions">
                  <label className="speed-select">
                    <span className="sr-only">Playback speed</span>
                    <select value={speed} onChange={event => setSpeed(event.target.value as PlaybackSpeed)}>
                      {SPEEDS.map(item => <option value={item} key={item}>{item}</option>)}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <button className="primary-button play-button" type="button" onClick={() => speak(analysis.text, 'sentence')}>
                    {playingKey === 'sentence' ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                    {playingKey === 'sentence' ? 'Stop' : 'Play'}
                  </button>
                </div>
              )}
            </div>

            {isLoading && <div className="result-skeleton" aria-label="Loading pronunciation"><span /><span /><span /></div>}
            {errors.pronunciation && <p className="inline-error section-error">{errors.pronunciation}</p>}

            {analysis && (
              <div className="word-token-list" aria-label="Words in sentence">
                {analysis.words.map((word, index) => {
                  const matchedEntry = entries.find(entry =>
                    entry.source_word.toLowerCase() === word.text.toLowerCase()
                    || entry.lemma.toLowerCase() === word.lemma?.toLowerCase(),
                  )
                  const tokenKey = `token-${index}`
                  return (
                    <button
                      className={`word-token ${matchedEntry?.id === selectedEntry?.id ? 'selected' : ''} ${playingKey === tokenKey ? 'playing' : ''}`}
                      type="button"
                      key={`${word.text}-${index}`}
                      onClick={() => {
                        speak(word.text, tokenKey)
                        if (matchedEntry) setSelectedEntryId(matchedEntry.id)
                      }}
                    >
                      <span className="token-word">{word.text}</span>
                      {preferences.visibility.wordIpa && <span className="token-ipa">{word.ipa}</span>}
                      <span className="token-pos">{partOfSpeechLabel(word.part_of_speech)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {(entries.length > 0 || isLoading || errors.dictionary) && (
          <section className="dictionary-shell">
            <aside className="entry-sidebar" aria-label="Words in this sentence">
              <div className="sidebar-heading">
                <span>Words in this sentence</span>
                <span>{entries.length}</span>
              </div>
              <div className="entry-list">
                {entries.map(entry => (
                  <button
                    className={`entry-list-item ${entry.id === selectedEntry?.id ? 'selected' : ''}`}
                    type="button"
                    key={entry.id}
                    onClick={() => selectEntry(entry)}
                  >
                    <span>
                      <strong>{entry.source_word}</strong>
                      {preferences.visibility.wordIpa && <small>{entry.ipa}</small>}
                    </span>
                    <em>{partOfSpeechLabel(entry.part_of_speech)}</em>
                  </button>
                ))}
              </div>
            </aside>

            <article className="dictionary-entry">
              {isLoading && <div className="dictionary-loading"><span className="spinner dark" /> Building dictionary entries…</div>}
              {errors.dictionary && <p className="inline-error section-error">{errors.dictionary}</p>}

              {selectedEntry && (
                <>
                  <header className="entry-header">
                    <div>
                      <div className="entry-title-row">
                        <h2>{selectedEntry.lemma}</h2>
                        <span className="pos-badge">{partOfSpeechLabel(selectedEntry.part_of_speech)}</span>
                        {selectedEntry.gender && <span className="grammar-badge">{selectedEntry.gender}</span>}
                      </div>
                      <div className="entry-meta">
                        {preferences.visibility.wordIpa && <span className="entry-ipa">{selectedEntry.ipa}</span>}
                        <span>{languageName(sourceLanguage)}</span>
                        {selectedEntry.inflection && <span>{selectedEntry.inflection}</span>}
                      </div>
                    </div>
                    <button className="round-audio-button" type="button" onClick={() => speak(selectedEntry.lemma, `entry-${selectedEntry.id}`)} aria-label={`Play ${selectedEntry.lemma}`}>
                      {playingKey === `entry-${selectedEntry.id}` ? <Pause size={19} /> : <Volume2 size={19} />}
                    </button>
                  </header>

                  <DictionaryMeanings
                    entry={selectedEntry}
                    visibility={preferences.visibility}
                    playingKey={playingKey}
                    onSpeak={(sentence, key) => speak(sentence, key)}
                  />

                  {preferences.visibility.conjugation && selectedEntry.verb && (
                    <DictionarySection title="Conjugation" className="conjugation-section">
                      {conjugationSections.length > 0 ? (
                        <ConjugationGrid
                          entry={selectedEntry}
                          sections={conjugationSections}
                          playingKey={playingKey}
                          onSpeak={(text, playbackKey) => speak(text, playbackKey, sourceLanguage)}
                        />
                      ) : <p className="dictionary-empty">No conjugated forms with person information are available.</p>}
                    </DictionarySection>
                  )}

                  {preferences.visibility.etymology && selectedEntry.etymology && (
                    <DictionarySection title="Word origin">
                      <p className="etymology-copy">{selectedEntry.etymology}</p>
                    </DictionarySection>
                  )}

                </>
              )}
            </article>
          </section>
        )}
      </main>

      {isCustomizerOpen && (
        <div className="drawer-layer" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setIsCustomizerOpen(false)
        }}>
          <aside className="customizer" role="dialog" aria-modal="true" aria-labelledby="customizer-title">
            <header className="customizer-header">
              <div><span className="section-kicker">Preferences</span><h2 id="customizer-title">Customize Nativecue</h2></div>
              <button className="icon-button" type="button" onClick={() => setIsCustomizerOpen(false)} aria-label="Close customization"><X size={19} /></button>
            </header>

            <div className="customizer-content">
              <SettingsGroup title="Appearance">
                <div className="setting-row">
                  <label htmlFor="background-color">Background color</label>
                  <input id="background-color" type="color" value={preferences.backgroundColor} onChange={event => updatePreference('backgroundColor', event.target.value)} />
                </div>
                <div className="color-presets" aria-label="Background presets">
                  {['#f6f3ec', '#f4f6f8', '#fff7f3', '#eef4f1', '#252729'].map(color => (
                    <button type="button" key={color} style={{ background: color }} className={preferences.backgroundColor === color ? 'active' : ''} onClick={() => updatePreference('backgroundColor', color)} aria-label={`Use ${color}`} />
                  ))}
                </div>
                <div className="setting-row stacked">
                  <div><label htmlFor="background-image">Background image</label><small>Use a calm image that keeps text readable.</small></div>
                  <div className="button-row">
                    <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Upload</button>
                    {backgroundImage && <button className="text-button" type="button" onClick={() => setBackgroundImage('')}>Remove</button>}
                  </div>
                  <input ref={fileInputRef} id="background-image" className="sr-only" type="file" accept="image/*" onChange={event => handleBackgroundImage(event.target.files?.[0])} />
                </div>
                <RangeSetting label="Background brightness" value={preferences.brightness} min={35} max={120} suffix="%" onChange={value => updatePreference('brightness', value)} />
                <RangeSetting label="Content backdrop" value={preferences.overlay} min={55} max={100} suffix="%" onChange={value => updatePreference('overlay', value)} />
              </SettingsGroup>

              <SettingsGroup title="Typography">
                <label className="select-setting">Font family<select value={preferences.fontPreset} onChange={event => updatePreference('fontPreset', event.target.value as FontPreset)}><option value="sans">Modern Sans</option><option value="serif">Editorial Serif</option><option value="accessible">Accessible Sans</option><option value="mono">Monospace Study Mode</option></select></label>
                <RangeSetting label="Text size" value={preferences.fontSize} min={14} max={22} suffix="px" onChange={value => updatePreference('fontSize', value)} />
                <RangeSetting label="IPA size" value={preferences.ipaSize} min={14} max={26} suffix="px" onChange={value => updatePreference('ipaSize', value)} />
                <RangeSetting label="Line height" value={preferences.lineHeight} min={1.3} max={2} step={0.05} onChange={value => updatePreference('lineHeight', value)} />
                <div className="setting-row"><label htmlFor="text-color">Text color</label><input id="text-color" type="color" value={preferences.textColor} onChange={event => updatePreference('textColor', event.target.value)} /></div>
              </SettingsGroup>

              <SettingsGroup title="Content visibility">
                <div className="preset-actions"><button type="button" onClick={() => setAllSections(true)}>Show all</button><button type="button" onClick={applyFocusMode}>Focus mode</button></div>
                <div className="toggle-list">
                  {(Object.keys(SECTION_LABELS) as SectionKey[]).map(key => (
                    <label className="toggle-row" key={key}>
                      <span>{SECTION_LABELS[key]}</span>
                      <input type="checkbox" checked={preferences.visibility[key]} onChange={() => toggleSection(key)} />
                      <span className="toggle-track"><span /></span>
                    </label>
                  ))}
                </div>
              </SettingsGroup>
            </div>

            <footer className="customizer-footer">
              <button className="secondary-button" type="button" onClick={() => {
                setPreferences(DEFAULT_PREFERENCES)
                setBackgroundImage('')
              }}><RotateCcw size={15} /> Reset to default</button>
              <button className="primary-button" type="button" onClick={() => setIsCustomizerOpen(false)}>Done</button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  )
}

function DictionaryMeanings({ entry, visibility, playingKey, onSpeak }: {
  entry: DictionaryEntry
  visibility: VisibilitySettings
  playingKey: string | null
  onSpeak: (sentence: string, key: string) => void
}) {
  const definitions = entry.definitions ?? []
  const linkedSentences = new Set(definitions.flatMap(item => item.examples ?? []).map(item => item.sentence))
  const sharedExamples = (entry.examples ?? []).filter(item => !linkedSentences.has(item.sentence))
  // The first three follow source order; this is not a frequency classification.
  const meaningGroups = [
    { title: 'Meanings', items: definitions.slice(0, 3), offset: 0 },
    { title: 'More meanings', items: definitions.slice(3), offset: 3 },
  ]
  const renderExamples = (examples: Example[], prefix: string) => (
    <div className="sense-examples">
      {examples.map((example, index) => {
        const key = `${entry.id}-${prefix}-${index}`
        return (
          <div className="sense-example" key={key}>
            <button className="small-icon-button" type="button" onClick={() => onSpeak(example.sentence, key)} aria-label={`Play example: ${example.sentence}`}>
              {playingKey === key ? <Pause size={14} /> : <Volume2 size={14} />}
            </button>
            <div>
              <p lang={entry.language}>{example.sentence}</p>
              {example.translation && <p className="sense-example-translation">{example.translation}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      {(visibility.definitions || visibility.examples) && (
        <div className={`meaning-layout ${visibility.definitions && visibility.examples && sharedExamples.length ? 'with-examples' : ''}`}>
          <div className="meaning-groups">
            {meaningGroups.map(group => group.items.length > 0 &&
              (visibility.definitions || group.items.some(item => item.examples?.length)) && (
              <DictionarySection key={group.title} title={group.title} className="meaning-section">
                <ol className="sense-list" start={group.offset + 1}>
                  {group.items.map((definition, index) => (
                    <li className="sense-row" key={`${group.offset + index}-${definition.meaning}`}>
                      {visibility.definitions && (
                        <div className="sense-definition">
                          <span className="sense-number">{String(group.offset + index + 1).padStart(2, '0')}</span>
                          <div>
                            {definition.register && <span className="sense-register">{definition.register}</span>}
                            <p>{definition.meaning}</p>
                            {definition.translation && <p className="sense-translation">{definition.translation}</p>}
                          </div>
                        </div>
                      )}
                      {visibility.examples && definition.examples?.length
                        ? renderExamples(definition.examples, `sense-${group.offset + index}`) : null}
                    </li>
                  ))}
                </ol>
              </DictionarySection>
            ))}
            {visibility.definitions && !definitions.length && (
              <p className="dictionary-empty">No definitions are available for this entry.</p>
            )}
          </div>
          {visibility.examples && sharedExamples.length > 0 && (
            <aside className="word-examples" aria-label="Examples for this word">
              <h3>Examples in context</h3>
              <p className="examples-note">Examples for this word</p>
              {renderExamples(sharedExamples, 'word')}
            </aside>
          )}
        </div>
      )}

    </>
  )
}

function ConjugationGrid({ entry, sections, playingKey, onSpeak }: {
  entry: DictionaryEntry
  sections: ConjugationSection[]
  playingKey: string | null
  onSpeak: (text: string, key: string) => void
}) {
  const subjects = subjectNames(entry.language)
  const nonFinite = [
    { label: 'Infinitive', form: entry.lemma, ipa: entry.ipa },
    { label: 'Present participle', form: entry.verb?.present_participle, ipa: entry.verb?.present_participle_ipa },
    { label: 'Past participle', form: entry.verb?.past_participle, ipa: entry.verb?.past_participle_ipa },
  ].filter((item): item is { label: string; form: string; ipa: string | undefined } => Boolean(item.form))

  return (
    <div className="conjugation-scroll">
      {nonFinite.length > 0 && <dl className="nonfinite-forms">
        {nonFinite.map(item => {
          const playbackKey = `conjugation-${entry.id}-${item.label}`
          return <div key={item.label}>
            <dt>{item.label}</dt>
            <dd><button className="conjugation-form-button" type="button" onClick={() => onSpeak(item.form, playbackKey)} aria-label={`Play ${item.form}`}>
              <span>{item.form}</span>
              {item.ipa && <small>{item.ipa}</small>}
              {playingKey === playbackKey ? <Pause size={13} /> : <Volume2 size={13} />}
            </button></dd>
          </div>
        })}
      </dl>}
      <table className="conjugation-table">
        <caption>{entry.lemma} — conjugation</caption>
        <thead>
          <tr><th rowSpan={2} scope="col">Mood</th><th rowSpan={2} scope="col">Tense</th><th colSpan={3} scope="colgroup">Singular</th><th colSpan={3} scope="colgroup">Plural</th></tr>
          <tr>{subjects.map(subject => <th scope="col" key={subject}>{subject}</th>)}</tr>
        </thead>
        <tbody>
          {sections.flatMap(section => section.groups.map((group, index) => {
            const forms = new Map(group.forms.map(form => [form.subject, form]))
            return <tr key={`${section.mood}-${group.tense}`}>
              {index === 0 && <th className="conjugation-mood" rowSpan={section.groups.length} scope="rowgroup">{section.mood}</th>}
              <th className="conjugation-tense" scope="row">{group.label}</th>
              {subjects.map(subject => {
                const form = forms.get(subject)
                const playbackKey = `conjugation-${entry.id}-${group.tense}-${subject}`
                return <td key={subject}>
                  {form ? <button
                    className="conjugation-form-button"
                    type="button"
                    onClick={() => onSpeak(form.form, playbackKey)}
                    aria-label={`Play ${form.form}`}
                  >
                    <span>{form.form}</span>
                    {form.ipa && <small>{form.ipa}</small>}
                    {playingKey === playbackKey ? <Pause size={13} /> : <Volume2 size={13} />}
                  </button> : '—'}
                </td>
              })}
            </tr>
          }))}
        </tbody>
      </table>
    </div>
  )
}

function DictionarySection({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return <section className={`dictionary-section ${className}`}><h3>{title}</h3>{children}</section>
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-group"><h3>{title}</h3>{children}</section>
}

function RangeSetting({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="range-setting">
      <span><span>{label}</span><output>{value}{suffix}</output></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} />
    </label>
  )
}

export default App
