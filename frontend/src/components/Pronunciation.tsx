import { ChevronDown, Pause, Play } from 'lucide-react'
import { SPEEDS, partOfSpeechLabel } from '../config'
import type { AnalyzeResponse, DictionaryEntry, PlaybackSpeed, VisibilitySettings, Speak } from '../types'

interface Props {
  analysis: AnalyzeResponse | null
  inputText: string
  entries: DictionaryEntry[]
  selectedEntry: DictionaryEntry | null
  visibility: VisibilitySettings
  speed: PlaybackSpeed
  playingKey: string | null
  isLoading: boolean
  errors: Record<string, string>
  setSpeed: (speed: PlaybackSpeed) => void
  setSelectedEntryId: (id: string) => void
  speak: Speak
}

export default function Pronunciation({
  analysis,
  inputText,
  entries,
  selectedEntry,
  visibility,
  speed,
  playingKey,
  isLoading,
  errors,
  setSpeed,
  setSelectedEntryId,
  speak,
}: Props) {
  if (!analysis && !isLoading && !errors.pronunciation) return null
  return (
    <section className="result-card pronunciation-card">
      <div className="section-header">
        <div>
          <span className="section-kicker">Pronunciation</span>
          <h1>{analysis?.text || inputText}</h1>
          {visibility.sentenceIpa && analysis?.ipa && <p className="sentence-ipa">{analysis.ipa}</p>}
        </div>
        {analysis && (
          <div className="pronunciation-actions">
            <label className="speed-select">
              <span className="sr-only">Playback speed</span>
              <select value={speed} onChange={(event) => setSpeed(event.target.value as PlaybackSpeed)}>
                {SPEEDS.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="primary-button play-button"
              type="button"
              onClick={() => speak(analysis.text, 'sentence')}
            >
              {playingKey === 'sentence' ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              {playingKey === 'sentence' ? 'Stop' : 'Play'}
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="result-skeleton" aria-label="Loading pronunciation">
          <span />
          <span />
          <span />
        </div>
      )}
      {errors.pronunciation && <p className="inline-error section-error">{errors.pronunciation}</p>}

      {analysis && (
        <div className="word-token-list" aria-label="Words in sentence">
          {analysis.words.map((word, index) => {
            const matchedEntry = entries.find(
              (entry) =>
                entry.source_word.toLowerCase() === word.text.toLowerCase() ||
                entry.lemma.toLowerCase() === word.lemma?.toLowerCase(),
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
                {visibility.wordIpa && <span className="token-ipa">{word.ipa}</span>}
                <span className="token-pos">{partOfSpeechLabel(word.part_of_speech)}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
