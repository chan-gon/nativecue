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


  const [saved, setSaved] = useState(false)
  const [deckCount, setDeckCount] = useState(0)

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
    setSaved(false)
    setDeckCount(0)

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
      setSaved(false)
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

  const handleSave = () => {
    if (saved) return
    setSaved(true)
    setDeckCount(count => count + 1)
  }

  const stressCues =
  naturalSpeech?.cues.filter(
    cue => cue.type === 'stress',
  ) ?? []

  const reductionCues =
    naturalSpeech?.cues.filter(
      cue => cue.type === 'reduction',
    ) ?? []

  const linkingCues =
    naturalSpeech?.cues.filter(
      cue => cue.type === 'linking',
    ) ?? []

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
                {/* <span className="nav-language-name">
                  {language === 'EN' ? 'English' : 'Français'}
                </span> */}
              </button>
            ))}
          </div>

          <button className={`deck-button ${deckCount > 0 ? 'has-items' : ''}`}>
            My Speech Deck ({deckCount})
          </button>
        </div>
      </nav>

      <main className="main">
        <section className="input-section">
          <div className="composer">
            <div className="script-panel">
              <div className="script-heading">
                <div className="eyebrow">SCRIPT</div>
                {/* <span className="script-language">
                  {activeLang === 'EN' ? 'English' : 'Française'}
                </span> */}
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
                  {/* <span className="character-count">({inputText.length})/{MAX_SCRIPT_LENGTH}</span> */}
                </div>

                <button
                  className="analyze-button"
                  onClick={handleSubmit}
                  disabled={!inputText.trim() || isAnalyzing}
                >
                  <span>{isAnalyzing ? 'Analyzing...' : 'Pronounce'}</span>
                  {/* {!isAnalyzing && <span aria-hidden="true">→</span>} */}
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

                {/* <button
                  className={`control-button compact ${isNativePlaying ? 'active' : ''}`}
                  onClick={handlePlaySentence}
                >
                  {isNativePlaying ? 'Stop' : 'Play'}
                </button> */}
              </div>

              <div className="sentence-analysis">
                {/* <div className="sentence-text">{sentence.text}</div>
                <div className="sentence-ipa">{sentence.ipa}</div> */}
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

              {/* <div className="word-list">
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
              </div> */}

              <div className="controls-row">
                {/* <button
                  className={`control-button compact ${isNativePlaying ? 'active' : ''}`}
                  onClick={handlePlaySentence}
                >
                  {isNativePlaying ? 'Stop' : 'Play'}
                </button> */}

                {/* <button
                  className="control-button compact"
                  onClick={cycleSpeed}
                >
                  {speed}
                </button> */}

                {/* <button
                  className="save-button compact"
                  onClick={handleSave}
                  disabled={saved}
                >
                  {saved ? 'Saved' : 'Save'}
                </button> */}

                <div>
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

                  <div className="natural-sentence">
                    {sentence?.words.map((word, index) => {
                      const isStress = stressCues.some(
                        cue =>
                          index >= cue.start_word &&
                          index <= cue.end_word,
                      )

                      const isReduction = reductionCues.some(
                        cue =>
                          index >= cue.start_word &&
                          index <= cue.end_word,
                      )

                      return (
                        <span
                          key={`${word.text}-${index}`}
                          className={[
                            'natural-word',
                            isStress ? 'stress' : '',
                            isReduction ? 'reduction' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {word.text}
                        </span>
                      )
                    })}
                  </div>

                  {reductionCues.length > 0 && (
                    <div className="cue-group">
                      <div className="cue-group-title">
                        Reduction
                      </div>

                      <div className="cue-list">
                        {reductionCues.map((cue, index) => (
                          <div
                            className="cue-item"
                            key={`reduction-${index}`}
                          >
                            <div className="cue-display">
                              {cue.display}
                            </div>

                            <div className="cue-explanation">
                              {cue.explanation}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stressCues.length > 0 && (
                    <div className="cue-group">
                      <div className="cue-group-title">
                        Stress
                      </div>

                      <div className="cue-list">
                        {stressCues.map((cue, index) => (
                          <div
                            className="cue-item"
                            key={`stress-${index}`}
                          >
                            <div className="cue-display stress-text">
                              {cue.display}
                            </div>

                            <div className="cue-explanation">
                              {cue.explanation}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {linkingCues.length > 0 && (
                    <div className="cue-group">
                      <div className="cue-group-title">
                        Linking
                      </div>

                      <div className="linking-list">
                        {linkingCues.map((cue, index) => (
                          <span
                            className="linking-item"
                            key={`linking-${index}`}
                          >
                            {cue.display.replace(' ', ' ‿ ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

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
