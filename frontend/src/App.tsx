import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type Language = 'EN' | 'FR'

interface ApiWord {
  text: string
  ipa: string
}

interface AnalyzeResponse {
  text: string
  language: string
  ipa: string
  words: ApiWord[]
}

interface Sentence {
  text: string
  ipa: string
  words: ApiWord[]
}

interface WaveformProps {
  data: number[]
  progress: number
  emptyText?: string
}

const API_BASE_URL = 'http://localhost:8000'
const LANGUAGES: Language[] = ['EN', 'FR']
const WAVEFORM_SAMPLES = 180

function createReferenceWaveform(text: string) {
  if (!text) return []

  const values: number[] = []

  for (let index = 0; index < WAVEFORM_SAMPLES; index++) {
    const charCode = text.charCodeAt(index % text.length)
    const waveA = Math.sin(index * 0.31 + charCode * 0.05)
    const waveB = Math.sin(index * 0.13 + charCode * 0.09)
    const value = Math.abs(waveA * 0.65 + waveB * 0.35)

    values.push(Math.max(0.08, Math.min(1, value)))
  }

  return values
}

function Waveform({ data, progress, emptyText = 'No audio yet' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const width = canvas.width
    const height = canvas.height

    context.clearRect(0, 0, width, height)

    if (data.length === 0) {
      context.fillStyle = '#8b90a0'
      context.font = '12px Inter, system-ui, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(emptyText, width / 2, height / 2)
      return
    }

    const centerY = height / 2
    const barWidth = width / data.length

    data.forEach((value, index) => {
      const barHeight = Math.max(2, value * (height - 14))
      const x = index * barWidth
      const y = centerY - barHeight / 2

      context.fillStyle = '#cbd5e1'
      context.fillRect(x, y, Math.max(1, barWidth - 1), barHeight)
    })

    const cursorX = Math.max(0, Math.min(width, progress * width))

    context.fillStyle = '#0066ff'
    context.fillRect(cursorX, 0, 2, height)
  }, [data, progress, emptyText])

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      width={900}
      height={72}
    />
  )
}

async function createWaveformFromBlob(audioBlob: Blob) {
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  const channelData = audioBuffer.getChannelData(0)

  const samples: number[] = []
  const blockSize = Math.max(1, Math.floor(channelData.length / WAVEFORM_SAMPLES))

  for (let sampleIndex = 0; sampleIndex < WAVEFORM_SAMPLES; sampleIndex++) {
    const start = sampleIndex * blockSize
    const end = Math.min(start + blockSize, channelData.length)

    let peak = 0

    for (let index = start; index < end; index++) {
      peak = Math.max(peak, Math.abs(channelData[index]))
    }

    samples.push(peak)
  }

  const maxPeak = Math.max(...samples, 0.001)
  const normalized = samples.map(value => value / maxPeak)

  await audioContext.close()

  return normalized
}

function App() {
  const [inputText, setInputText] = useState('')
  const [sentence, setSentence] = useState<Sentence | null>(null)
  const [activeLang, setActiveLang] = useState<Language>('EN')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [isNativePlaying, setIsNativePlaying] = useState(false)
  const [isUserAudioPlaying, setIsUserAudioPlaying] = useState(false)
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null)
  const [speed, setSpeed] = useState<'1.0x' | '0.8x' | '0.6x'>('1.0x')

  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [userWaveform, setUserWaveform] = useState<number[]>([])
  const [nativeProgress, setNativeProgress] = useState(0)
  const [userProgress, setUserProgress] = useState(0)

  const [saved, setSaved] = useState(false)
  const [deckCount, setDeckCount] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const userAudioRef = useRef<HTMLAudioElement | null>(null)
  const nativeAnimationRef = useRef<number | null>(null)

  const nativeWaveform = sentence
    ? createReferenceWaveform(sentence.text)
    : []

  const stopNativeProgressAnimation = () => {
    if (nativeAnimationRef.current !== null) {
      cancelAnimationFrame(nativeAnimationRef.current)
      nativeAnimationRef.current = null
    }
  }

  const stopUserAudio = () => {
    if (!userAudioRef.current) return

    userAudioRef.current.pause()
    userAudioRef.current.currentTime = 0
    setIsUserAudioPlaying(false)
    setUserProgress(0)
  }

  const resetAppState = () => {
    window.speechSynthesis.cancel()
    stopNativeProgressAnimation()

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null
    audioChunksRef.current = []

    stopUserAudio()
    userAudioRef.current = null

    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl)
    }

    setInputText('')
    setSentence(null)
    setActiveLang('EN')
    setIsAnalyzing(false)
    setError(null)
    setIsRecording(false)
    setIsNativePlaying(false)
    setIsUserAudioPlaying(false)
    setActiveWordIndex(null)
    setSpeed('1.0x')
    setRecordingUrl(null)
    setUserWaveform([])
    setNativeProgress(0)
    setUserProgress(0)
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
      stopNativeProgressAnimation()
      stopUserAudio()

      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl)
      }

      setSentence({
        text: data.text,
        ipa: data.ipa,
        words: data.words,
      })

      setRecordingUrl(null)
      setUserWaveform([])
      setNativeProgress(0)
      setUserProgress(0)
      setActiveWordIndex(null)
      setSaved(false)
    } catch (err) {
      console.error(err)
      setSentence(null)
      setError('Could not connect to the analyzer backend.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [activeLang, recordingUrl])

  const handleSubmit = () => analyze(inputText)

  const getSpeechRate = () => {
    if (speed === '0.8x') return 0.8
    if (speed === '0.6x') return 0.6
    return 1
  }

  const startNativeProgressAnimation = (text: string) => {
    stopNativeProgressAnimation()

    const rate = getSpeechRate()
    const estimatedDuration = Math.max(
      1200,
      (text.split(/\s+/).length * 420) / rate,
    )

    const startedAt = performance.now()

    const update = (now: number) => {
      const elapsed = now - startedAt
      const progress = Math.min(0.97, elapsed / estimatedDuration)

      setNativeProgress(progress)

      if (progress < 0.97) {
        nativeAnimationRef.current = requestAnimationFrame(update)
      }
    }

    nativeAnimationRef.current = requestAnimationFrame(update)
  }

  const speakText = (text: string, wordIndex: number | null = null) => {
    window.speechSynthesis.cancel()
    stopNativeProgressAnimation()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = activeLang === 'EN' ? 'en-US' : 'fr-FR'
    utterance.rate = getSpeechRate()

    utterance.onstart = () => {
      setIsNativePlaying(true)
      setActiveWordIndex(wordIndex)

      if (wordIndex === null) {
        setNativeProgress(0)
        startNativeProgressAnimation(text)
      }
    }

    utterance.onboundary = event => {
      if (wordIndex !== null || text.length === 0) return

      const boundaryProgress = event.charIndex / text.length
      setNativeProgress(Math.max(0, Math.min(1, boundaryProgress)))
    }

    utterance.onend = () => {
      stopNativeProgressAnimation()
      setIsNativePlaying(false)
      setActiveWordIndex(null)

      if (wordIndex === null) {
        setNativeProgress(1)
      }
    }

    utterance.onerror = () => {
      stopNativeProgressAnimation()
      setIsNativePlaying(false)
      setActiveWordIndex(null)
    }

    window.speechSynthesis.speak(utterance)
  }

  const handlePlaySentence = () => {
    if (!sentence) return

    stopUserAudio()

    if (isNativePlaying) {
      window.speechSynthesis.cancel()
      stopNativeProgressAnimation()
      setIsNativePlaying(false)
      setNativeProgress(0)
      return
    }

    speakText(sentence.text)
  }

  const handleWordClick = (word: ApiWord, index: number) => {
    stopUserAudio()
    speakText(word.text, index)
  }

  const handleRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }

    try {
      setError(null)

      window.speechSynthesis.cancel()
      stopNativeProgressAnimation()
      setIsNativePlaying(false)
      setNativeProgress(0)
      stopUserAudio()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        if (recordingUrl) {
          URL.revokeObjectURL(recordingUrl)
        }

        const newUrl = URL.createObjectURL(audioBlob)
        const waveform = await createWaveformFromBlob(audioBlob)

        setRecordingUrl(newUrl)
        setUserWaveform(waveform)
        setUserProgress(0)
        setIsRecording(false)

        stream.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error(err)
      setError('Microphone access is required to record your speech.')
      setIsRecording(false)
    }
  }

  const handlePlayUserRecording = () => {
    if (!recordingUrl) return

    window.speechSynthesis.cancel()
    stopNativeProgressAnimation()
    setIsNativePlaying(false)
    setNativeProgress(0)

    if (!userAudioRef.current || userAudioRef.current.src !== recordingUrl) {
      userAudioRef.current?.pause()

      const audio = new Audio(recordingUrl)
      userAudioRef.current = audio

      audio.ontimeupdate = () => {
        if (!audio.duration) return
        setUserProgress(audio.currentTime / audio.duration)
      }

      audio.onended = () => {
        setIsUserAudioPlaying(false)
        setUserProgress(1)
      }
    }

    const audio = userAudioRef.current

    if (isUserAudioPlaying) {
      audio.pause()
      audio.currentTime = 0
      setIsUserAudioPlaying(false)
      setUserProgress(0)
      return
    }

    audio.currentTime = 0
    setUserProgress(0)
    audio.play()
    setIsUserAudioPlaying(true)
  }

  const cycleSpeed = () => {
    setSpeed(current =>
      current === '1.0x'
        ? '0.8x'
        : current === '0.8x'
          ? '0.6x'
          : '1.0x',
    )
  }

  const handleSave = () => {
    if (saved) return
    setSaved(true)
    setDeckCount(count => count + 1)
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

        <div className="nav-tagline">Practice the sentences you actually want to say.</div>

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
                <div className="section-label">SCRIPT</div>
                <span className="script-language">
                  {activeLang === 'EN' ? 'English pronunciation' : 'Prononciation française'}
                </span>
              </div>

              <textarea
                className="sentence-input"
                value={inputText}
                onChange={event => setInputText(event.target.value)}
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
                  <span className="character-count">{inputText.length}</span>
                </div>

                <button
                  className="analyze-button"
                  onClick={handleSubmit}
                  disabled={!inputText.trim() || isAnalyzing}
                >
                  <span>{isAnalyzing ? 'Analyzing...' : 'Analyze pronunciation'}</span>
                  {!isAnalyzing && <span aria-hidden="true">→</span>}
                </button>
              </div>
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}
        </section>

        {sentence && (
          <div className="workspace">
            <section className="studio">
              <div className="studio-header">
                <div>
                  <div className="eyebrow">Pronunciation</div>
                  <div className="studio-count">
                    {sentence.words.length} words · {activeLang}
                  </div>
                </div>

                <button
                  className={`control-button compact ${isNativePlaying ? 'active' : ''}`}
                  onClick={handlePlaySentence}
                >
                  {isNativePlaying ? 'Stop Native' : 'Play Native'}
                </button>
              </div>

              <div className="sentence-analysis">
                <div className="sentence-text">{sentence.text}</div>
                <div className="sentence-ipa">{sentence.ipa}</div>
              </div>

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

              <div className="controls-row">
                <button
                  className={`mic-button ${isRecording ? 'recording' : ''}`}
                  onClick={handleRecord}
                  type="button"
                >
                  {isRecording ? 'Stop Recording' : 'Record'}
                </button>

                <button
                  className="control-button compact"
                  onClick={cycleSpeed}
                >
                  {speed}
                </button>

                <button
                  className="save-button compact"
                  onClick={handleSave}
                  disabled={saved}
                >
                  {saved ? 'Saved' : 'Save'}
                </button>
              </div>
            </section>

            <section className="comparison">
              <div className="comparison-header">
                <div>
                  <div className="eyebrow">Wave Comparison</div>
                  <div className="comparison-help">
                    Native reference vs your recording
                  </div>
                </div>
              </div>

              <div className="wave-row">
                <div className="wave-label-row">
                  <span>Native</span>
                  <button
                    className="wave-play-button"
                    onClick={handlePlaySentence}
                  >
                    {isNativePlaying ? 'Stop' : 'Play'}
                  </button>
                </div>

                <Waveform
                  data={nativeWaveform}
                  progress={nativeProgress}
                />
              </div>

              <div className="wave-row">
                <div className="wave-label-row">
                  <span>You</span>
                  <button
                    className="wave-play-button"
                    onClick={handlePlayUserRecording}
                    disabled={!recordingUrl}
                  >
                    {isUserAudioPlaying ? 'Stop' : 'Play'}
                  </button>
                </div>

                <Waveform
                  data={userWaveform}
                  progress={userProgress}
                  emptyText="Record your voice to create a waveform"
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
