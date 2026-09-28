import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowLeftRight, SlidersHorizontal } from 'lucide-react'
import Translator from './components/Translator'
import Pronunciation from './components/Pronunciation'
import Dictionary from './components/Dictionary'
import Customizer from './components/Customizer'
import { FONT_STACKS, PREFERENCE_KEY, languageLocale, loadPreferences } from './config'
import { requestJson } from './api'
import type {
  Language,
  PlaybackSpeed,
  AnalyzeResponse,
  TranslationResponse,
  DictionaryResponse,
  DictionaryEntry,
  Preferences,
} from './types'
import './App.css'

// Shared state and request flow live here; each screen section owns its JSX.
function App() {
  const [sourceLanguage, setSourceLanguage] = useState<Language>('EN')
  const targetLanguage: Language = sourceLanguage === 'EN' ? 'FR' : 'EN'
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

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null

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
    setSpeed('1.0x')
    window.history.replaceState({}, '', '/')
  }

  const speak = (text: string, key: string, language = sourceLanguage) => {
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
  }

  const handleSubmit = async () => {
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
  }

  const changeLanguage = (language: Language) => {
    setSourceLanguage(language)
    resetResults()
  }

  const swapLanguages = () => {
    const nextSource = targetLanguage
    setSourceLanguage(nextSource)

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
              <path
                d="M9 17V10Q9 6 13 6Q17 6 17 10V17"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".45"
              />
              <path
                d="M7 17V10Q7 6 11 6Q15 6 15 10V17"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
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
        <Translator
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          inputText={inputText}
          translation={translation}
          showTranslation={preferences.visibility.translation}
          isLoading={isLoading}
          playingKey={playingKey}
          errors={errors}
          copied={copied}
          changeLanguage={changeLanguage}
          setInputText={setInputText}
          resetResults={resetResults}
          handleSubmit={handleSubmit}
          swapLanguages={swapLanguages}
          copyTranslation={copyTranslation}
          speak={speak}
        />
        <Pronunciation
          analysis={analysis}
          inputText={inputText}
          entries={entries}
          selectedEntry={selectedEntry}
          visibility={preferences.visibility}
          speed={speed}
          playingKey={playingKey}
          isLoading={isLoading}
          errors={errors}
          setSpeed={setSpeed}
          setSelectedEntryId={setSelectedEntryId}
          speak={speak}
        />
        <Dictionary
          entries={entries}
          selectedEntry={selectedEntry}
          sourceLanguage={sourceLanguage}
          visibility={preferences.visibility}
          playingKey={playingKey}
          isLoading={isLoading}
          errors={errors}
          selectEntry={selectEntry}
          speak={speak}
        />
      </main>
      {isCustomizerOpen && (
        <Customizer
          preferences={preferences}
          setPreferences={setPreferences}
          backgroundImage={backgroundImage}
          setBackgroundImage={setBackgroundImage}
          onClose={() => setIsCustomizerOpen(false)}
        />
      )}
    </div>
  )
}

export default App
