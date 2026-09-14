import { useCallback, useState } from 'react'
import { Play } from 'lucide-react'
import './App.css'

type Language = 'EN' | 'FR'

interface ApiWord {
  text: string
  ipa: string
}

type NaturalSpeechCueType =
  | 'stress'
  | 'linking'
  | 'reduction'
  | 'rhythm_group'
  | 'liaison'
  | 'enchainement'
  | 'elision'
  | 'schwa'

interface AnalyzeResponse {
  text: string
  language: string
  ipa: string
  words: ApiWord[]
}

interface NaturalSpeechCue {
  type: NaturalSpeechCueType
  start_word: number
  end_word: number
  display: string
  explanation: string
}

interface NaturalSpeechResponse {
  text: string
  language: string
  cues: NaturalSpeechCue[]
}

interface Sentence {
  text: string
  ipa: string
  words: ApiWord[]
}

const API_BASE_URL = 'http://localhost:8000'
const LANGUAGES: Language[] = ['EN', 'FR']
const MAX_SCRIPT_LENGTH = 100

function App() {
  const [inputText, setInputText] = useState('')
  const [sentence, setSentence] = useState<Sentence | null>(null)

  const [naturalSpeech, setNaturalSpeech] = useState<NaturalSpeechResponse | null>(null)
  const [isNaturalSpeechLoading, setIsNaturalSpeechLoading] = useState(false)

  const [activeLang, setActiveLang] = useState<Language>('EN')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isNativePlaying, setIsNativePlaying] = useState(false)
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null)
  const [speed, setSpeed] = useState<'1.0x' | '0.8x' | '0.6x' | '0.4x' | '0.2x'>('1.0x')

  const resetAppState = () => {
    window.speechSynthesis.cancel()

    setInputText('')
    setSentence(null)
    setNaturalSpeech(null)
    setActiveLang('EN')
    setIsAnalyzing(false)
    setIsNaturalSpeechLoading(false)
    setError(null)
    setIsNativePlaying(false)
    setActiveWordIndex(null)
    setSpeed('1.0x')

    window.history.replaceState({}, '', '/')
  }

  const handleBannerClick = () => {
    resetAppState()
  }

  const analyze = useCallback(async (text: string) => {
    if (!text.trim()) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: activeLang.toLowerCase(),
        }),
      })

      if (!response.ok) {
        throw new Error(`Analyze failed: ${response.status}`)
      }

      const data: AnalyzeResponse = await response.json()

      window.speechSynthesis.cancel()

      setSentence({
        text: data.text,
        ipa: data.ipa,
        words: data.words,
      })

      setActiveWordIndex(null)
    } catch (err) {
      console.error(err)
      setSentence(null)
      setError('Could not connect to the analyzer backend.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [activeLang])

  const analyzeNaturalSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return

    setIsNaturalSpeechLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/natural_speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: activeLang.toLowerCase(),
        }),
      },
    )

      if (!response.ok) {
        throw new Error(`Natural speech analysis failed: ${response.status}`)
      }

      const data: NaturalSpeechResponse = await response.json()
      setNaturalSpeech(data)
    } catch (err) {
      console.error(err)
      setNaturalSpeech(null)
    } finally {
      setIsNaturalSpeechLoading(false)
    }
  }, [activeLang])

  const handleSubmit = () => {
    analyze(inputText)
    analyzeNaturalSpeech(inputText)
  }

  const handleInputChange = (value: string) => {
    if (value.length > MAX_SCRIPT_LENGTH) {
      setInputText(value.slice(0, MAX_SCRIPT_LENGTH))
      window.alert(`Script is limited to ${MAX_SCRIPT_LENGTH} characters.`)
      return
    }

    setInputText(value)
  }

  const getSpeechRate = () => Number.parseFloat(speed)

  const speakText = (text: string, wordIndex: number | null = null) => {
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = activeLang === 'EN' ? 'en-US' : 'fr-FR'
    utterance.rate = getSpeechRate()

    utterance.onstart = () => {
      setIsNativePlaying(true)
      setActiveWordIndex(wordIndex)
    }

    utterance.onend = () => {
      setIsNativePlaying(false)
      setActiveWordIndex(null)
    }

    utterance.onerror = () => {
      setIsNativePlaying(false)
      setActiveWordIndex(null)
    }

    window.speechSynthesis.speak(utterance)
  }

  const handlePlaySentence = () => {
    if (!sentence) return

    if (isNativePlaying) {
      window.speechSynthesis.cancel()
      setIsNativePlaying(false)
      return
    }

    speakText(sentence.text)
  }

  const handleWordClick = (word: ApiWord, index: number) => {
    speakText(word.text, index)
  }

  const cycleSpeed = () => {
    setSpeed(current =>
      current === '1.0x'
        ? '0.8x'
        : current === '0.8x'
          ? '0.6x'
          : current === '0.6x'
            ? '0.4x'
            : current === '0.4x'
              ? '0.2x'
              : '1.0x',
    )
  }

  const cueMeta: Record<NaturalSpeechCueType, { label: string; hint: string }> = {
    stress: {
      label: 'Stress',
      hint: 'Give these words more prominence.',
    },
    linking: {
      label: 'Linking',
      hint: 'Let these words flow together.',
    },
    reduction: {
      label: 'Reduction',
      hint: 'Use the common reduced spoken form.',
    },
    rhythm_group: {
      label: 'Rhythm group',
      hint: 'Practice this sequence as one smooth chunk.',
    },
    liaison: {
      label: 'Liaison',
      hint: 'Pronounce the normally silent consonant into the next word.',
    },
    enchainement: {
      label: 'Enchaînement',
      hint: 'Carry the already-pronounced final consonant into the next word.',
    },
    elision: {
      label: 'Elision',
      hint: 'Keep the written vowel omission connected and compact.',
    },
    schwa: {
      label: 'Schwa',
      hint: 'This unstressed e may weaken or disappear in natural speech.',
    },
  }

  const cueOrder: NaturalSpeechCueType[] =
    activeLang === 'EN'
      ? ['stress', 'reduction', 'linking']
      : ['rhythm_group', 'liaison', 'enchainement', 'elision', 'schwa']

  const cuesByType = cueOrder
    .map(type => ({
      type,
      cues: naturalSpeech?.cues.filter(cue => cue.type === type) ?? [],
    }))
    .filter(group => group.cues.length > 0)

  const hasCueAtWord = (type: NaturalSpeechCueType, wordIndex: number) =>
    naturalSpeech?.cues.some(
      cue =>
        cue.type === type &&
        wordIndex >= cue.start_word &&
        wordIndex <= cue.end_word,
    ) ?? false

  const getBoundaryCue = (wordIndex: number) =>
    naturalSpeech?.cues.find(
      cue =>
        ['linking', 'liaison', 'enchainement'].includes(cue.type) &&
        cue.end_word === wordIndex + 1 &&
        cue.start_word <= wordIndex,
    )

  const getRhythmGroupPosition = (wordIndex: number) => {
    const cue = naturalSpeech?.cues.find(
      item =>
        item.type === 'rhythm_group' &&
        wordIndex >= item.start_word &&
        wordIndex <= item.end_word,
    )

    if (!cue) return ''
    if (cue.start_word === cue.end_word) return 'rhythm-single'
    if (wordIndex === cue.start_word) return 'rhythm-start'
    if (wordIndex === cue.end_word) return 'rhythm-end'
    return 'rhythm-middle'
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div
          className="logo"
          onClick={handleBannerClick}
          role="button"
          tabIndex={0}
        >
        <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            {/* Back n */}
            <path
                d="M9 17V10 Q9 6 13 6 Q17 6 17 10V17"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.45"
            />

            {/* Front n */}
            <path
                d="M7 17V10 Q7 6 11 6 Q15 6 15 10V17"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
            />
            </svg>
          </div>
          <span className="logo-text">nativecue</span>
        </div>

        <div className="nav-tagline">Find the cue in every sentence.</div>

        <div className="nav-controls">
          <div className="nav-language-cards" aria-label="Practice language">
            {LANGUAGES.map(language => (
              <button
                key={language}
                type="button"
                className={`nav-language-card ${language === activeLang ? 'active' : ''}`}
                onClick={() => setActiveLang(language)}
              >
                <span className="nav-language-code">{language}</span>
                <span className="nav-language-name">
                  {language === 'EN' ? 'English' : 'Français'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="main">
        <section className="input-section">
          <div className="composer">
            <div className="script-panel">
              <div className="script-heading">
                <div className="eyebrow">SCRIPT</div>
                <div>
                  <span className="character-count">({inputText.length})/{MAX_SCRIPT_LENGTH}</span>
                </div>
              </div>

              <textarea
                className="sentence-input"
                value={inputText}
                onChange={event => handleInputChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={
                  activeLang === 'EN'
                    ? 'Type a sentence you want to practice in English...'
                    : 'Saisissez une phrase que vous souhaitez pratiquer en français...'
                }
                rows={3}
              />

              <div className="input-actions">
                <div className="input-meta">
                  <span className="input-hint">Enter to analyze · Shift + Enter for a new line</span>
                </div>

                <button
                  className="analyze-button"
                  onClick={handleSubmit}
                  disabled={!inputText.trim() || isAnalyzing}
                >
                  <span>{isAnalyzing ? 'Analyzing...' : 'Pronounce'}</span>
                </button>
              </div>
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}
        </section>

        {sentence && (
          <>
          <div className="workspace">
            <section className="studio">
              <div className="studio-header">
                  <div className="eyebrow">Pronunciation</div>
                  <div className="studio-count">
                    {sentence.words.length} words · {activeLang}
                  </div>
              </div>

              <div className="sentence-analysis">
                  <div className="word-list">
                  {sentence.words.map((word, index) => (
                    <button
                      key={`${word.text}-${index}`}
                      className={`word-card ${activeWordIndex === index ? 'active' : ''}`}
                      onClick={() => handleWordClick(word, index)}
                      type="button"
                    >
                      <span className="word-text">{word.text}</span>
                      <span className="word-ipa">{word.ipa}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="controls-row">
                <div style={{display: "flex", gap:"10px"}}>
                  <button
                    className="control-button compact"
                    onClick={cycleSpeed}
                  >
                    {speed}
                  </button>
                  <button
                    className="analyze-button"
                    onClick={handlePlaySentence}
                    disabled={!inputText.trim() || isAnalyzing}
                  >
                    {isNativePlaying ? (
                      <>
                        <span className="playing-wave" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play size={20} fill="currentColor" />
                        <span>Play</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="workspace">
            <section className="studio natural-speech">
              <div className="studio-header">
                <div className="eyebrow">
                  Natural Speech
                </div>

                {naturalSpeech && (
                  <div className="studio-count">
                    {naturalSpeech.cues.length} cues
                  </div>
                )}
              </div>

              {isNaturalSpeechLoading && (
                <div className="natural-loading">
                  Analyzing natural speech...
                </div>
              )}

              {!isNaturalSpeechLoading && naturalSpeech && (
                <div className="natural-content">
                  <div className="natural-overview">
                    {/* <div>
                      <div className="natural-overview-label">How it flows</div>
                      <p className="natural-overview-copy">
                        Read the sentence as connected speech, then review each cue below.
                      </p>
                    </div> */}

                    <div className="natural-legend" aria-label="Natural speech legend">
                      {cuesByType.map(({ type }) => (
                        <span
                          className={`natural-legend-item cue-${type}`}
                          key={type}
                        >
                          <span className="natural-legend-dot" />
                          {cueMeta[type].label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="natural-sentence" aria-label="Natural speech annotated sentence">
                    {sentence?.words.map((word, index) => {
                      const boundaryCue = getBoundaryCue(index)
                      const rhythmPosition = getRhythmGroupPosition(index)

                      const wordClasses = [
                        'natural-word',
                        hasCueAtWord('stress', index) ? 'cue-stress' : '',
                        hasCueAtWord('reduction', index) ? 'cue-reduction' : '',
                        hasCueAtWord('elision', index) ? 'cue-elision' : '',
                        hasCueAtWord('schwa', index) ? 'cue-schwa' : '',
                        rhythmPosition,
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <span className="natural-token" key={`${word.text}-${index}`}>
                          <span className={wordClasses}>{word.text}</span>

                          {boundaryCue && (
                            <span
                              className={`speech-boundary cue-${boundaryCue.type}`}
                              title={cueMeta[boundaryCue.type].label}
                              aria-label={cueMeta[boundaryCue.type].label}
                            >
                              <span className="speech-boundary-line" />
                              <span className="speech-boundary-symbol">‿</span>
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>

                  <div className="natural-cue-groups">
                    {cuesByType.map(({ type, cues }) => (
                      <section className={`cue-group cue-${type}`} key={type}>
                        <div className="cue-group-heading">
                          <div>
                            <div className="cue-group-title">
                              <span className="cue-group-marker" />
                              {cueMeta[type].label}
                            </div>
                            <div className="cue-group-hint">{cueMeta[type].hint}</div>
                          </div>
                          <span className="cue-group-count">{cues.length}</span>
                        </div>

                        <div className="cue-list">
                          {cues.map((cue, index) => (
                            <article className="cue-item" key={`${type}-${index}`}>
                              <div className="cue-display-row">
                                <div
                                  className={`cue-display ${type === 'stress' ? 'stress-text' : ''}`}
                                >
                                  {['linking', 'liaison', 'enchainement'].includes(type)
                                    ? cue.display.replace(' ', ' ‿ ')
                                    : cue.display}
                                </div>
                                <span className="cue-word-range">
                                  {cue.start_word === cue.end_word
                                    ? `word ${cue.start_word + 1}`
                                    : `words ${cue.start_word + 1}–${cue.end_word + 1}`}
                                </span>
                              </div>

                              <div className="cue-explanation">
                                {cue.explanation}
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}

                    {cuesByType.length === 0 && (
                      <div className="natural-empty">
                        No high-confidence natural-speech cues were found for this sentence.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          </>
        )}
      </main>
    </div>
  )
}

export default App
