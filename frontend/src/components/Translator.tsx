import { ArrowLeftRight, Check, ChevronDown, Copy, Pause, Volume2, X } from 'lucide-react'
import { MAX_SCRIPT_LENGTH } from '../config'
import type { Language, TranslationResponse, Speak } from '../types'

interface Props {
  sourceLanguage: Language
  targetLanguage: Language
  inputText: string
  translation: TranslationResponse | null
  showTranslation: boolean
  isLoading: boolean
  playingKey: string | null
  errors: Record<string, string>
  copied: boolean
  changeLanguage: (value: Language) => void
  setInputText: (value: string) => void
  resetResults: () => void
  handleSubmit: () => Promise<void>
  swapLanguages: () => void
  copyTranslation: () => Promise<void>
  speak: Speak
}

export default function Translator({
  sourceLanguage,
  targetLanguage,
  inputText,
  translation,
  showTranslation,
  isLoading,
  playingKey,
  errors,
  copied,
  changeLanguage,
  setInputText,
  resetResults,
  handleSubmit,
  swapLanguages,
  copyTranslation,
  speak,
}: Props) {
  return (
    <section className={`translator-card ${!showTranslation ? 'translation-hidden' : ''}`}>
      <div className="translator-panel source-panel">
        <div className="panel-toolbar">
          <label className="language-select-label">
            <span>From</span>
            <select
              value={sourceLanguage}
              onChange={(event) => {
                changeLanguage(event.target.value as Language)
              }}
            >
              <option value="EN">English</option>
              <option value="FR">Français</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <span className="character-count">
            {inputText.length}/{MAX_SCRIPT_LENGTH}
          </span>
        </div>

        <div className="input-wrap">
          <textarea
            className="sentence-input"
            value={inputText}
            maxLength={MAX_SCRIPT_LENGTH}
            rows={5}
            onChange={(event) => setInputText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={
              sourceLanguage === 'EN'
                ? 'Type a sentence you want to understand and pronounce…'
                : 'Saisissez une phrase que vous souhaitez comprendre et prononcer…'
            }
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
          <div>
            <span className="keyboard-hint">· Enter to pronounce</span>
            <span className="keyboard-hint">· Shift + Enter for a new line</span>
          </div>
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

      {showTranslation && (
        <>
          <button
            className="swap-button"
            type="button"
            onClick={swapLanguages}
            aria-label="Swap translation languages"
          >
            <ArrowLeftRight size={17} />
          </button>

          <div className="translator-panel target-panel">
            <div className="panel-toolbar">
              <label className="language-select-label">
                <span>To</span>
                <select
                  value={targetLanguage}
                  onChange={(event) => {
                    changeLanguage(event.target.value === 'EN' ? 'FR' : 'EN')
                  }}
                >
                  <option value="FR">Français</option>
                  <option value="EN">English</option>
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
              {translation?.translation && (
                <div className="inline-actions">
                  <button
                    className="small-icon-button"
                    type="button"
                    onClick={() => speak(translation.translation, 'translation', targetLanguage)}
                    aria-label="Play translation"
                  >
                    {playingKey === 'translation' ? <Pause size={16} /> : <Volume2 size={16} />}
                  </button>
                  <button
                    className="small-icon-button"
                    type="button"
                    onClick={() => void copyTranslation()}
                    aria-label="Copy translation"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              )}
            </div>

            <div className={`translation-output ${translation?.translation ? 'has-result' : ''}`}>
              {isLoading ? (
                <div className="module-loading">
                  <span className="spinner dark" /> Translating…
                </div>
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
  )
}
