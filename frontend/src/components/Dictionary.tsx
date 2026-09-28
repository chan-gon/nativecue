import { useMemo, useRef, type ReactNode } from 'react'
import { Pause, Volume2, X } from 'lucide-react'
import { languageName, partOfSpeechLabel } from '../config'
import { organizeConjugations, subjectNames, type ConjugationSection } from '../conjugations'
import type { DictionaryEntry, Example, Language, VisibilitySettings, Speak } from '../types'

interface Props {
  entries: DictionaryEntry[]
  selectedEntry: DictionaryEntry | null
  sourceLanguage: Language
  visibility: VisibilitySettings
  playingKey: string | null
  isLoading: boolean
  errors: Record<string, string>
  selectEntry: (entry: DictionaryEntry) => void
  speak: Speak
}

export default function Dictionary({
  entries,
  selectedEntry,
  sourceLanguage,
  visibility,
  playingKey,
  isLoading,
  errors,
  selectEntry,
  speak,
}: Props) {
  const conjugationSections = useMemo(() => organizeConjugations(selectedEntry), [selectedEntry])
  if (!entries.length && !isLoading && !errors.dictionary) return null
  return (
    <section className="dictionary-shell">
      <aside className="entry-sidebar" aria-label="Words in this sentence">
        <div className="sidebar-heading">
          <span>Words in this sentence</span>
          <span>{entries.length}</span>
        </div>
        <div className="entry-list">
          {entries.map((entry) => (
            <button
              className={`entry-list-item ${entry.id === selectedEntry?.id ? 'selected' : ''}`}
              type="button"
              key={entry.id}
              onClick={() => selectEntry(entry)}
            >
              <span>
                <strong>{entry.source_word}</strong>
                {visibility.wordIpa && <small>{entry.ipa}</small>}
              </span>
              <em>{partOfSpeechLabel(entry.part_of_speech)}</em>
            </button>
          ))}
        </div>
      </aside>

      <article className="dictionary-entry">
        {isLoading && (
          <div className="dictionary-loading">
            <span className="spinner dark" /> Building dictionary entries…
          </div>
        )}
        {errors.dictionary && <p className="inline-error section-error">{errors.dictionary}</p>}

        {selectedEntry && (
          <>
            <header className="entry-header">
              <div>
                <div className="entry-title-row">
                  <h2>{selectedEntry.lemma}</h2>
                  <span className="pos-badge">{partOfSpeechLabel(selectedEntry.part_of_speech)}</span>
                  <button
                    className="round-audio-button"
                    type="button"
                    onClick={() => speak(selectedEntry.lemma, `entry-${selectedEntry.id}`)}
                    aria-label={`Play ${selectedEntry.lemma}`}
                  >
                    {playingKey === `entry-${selectedEntry.id}` ? <Pause size={19} /> : <Volume2 size={19} />}
                  </button>
                  {selectedEntry.gender && <span className="grammar-badge">{selectedEntry.gender}</span>}
                </div>
                <div className="entry-meta">
                  {visibility.wordIpa && <span className="entry-ipa">{selectedEntry.ipa}</span>}
                  <span>{languageName(sourceLanguage)}</span>
                  {selectedEntry.inflection && <span>{selectedEntry.inflection}</span>}
                </div>
              </div>
              {visibility.etymology && selectedEntry.etymology && (
                <WordOrigin key={selectedEntry.id} entry={selectedEntry} />
              )}
            </header>

            <DictionaryMeanings
              entry={selectedEntry}
              visibility={visibility}
              playingKey={playingKey}
              onSpeak={speak}
            />

            {visibility.conjugation && selectedEntry.verb && (
              <DictionarySection title="Conjugation" className="conjugation-section">
                {conjugationSections.length > 0 ? (
                  <ConjugationGrid
                    entry={selectedEntry}
                    sections={conjugationSections}
                    playingKey={playingKey}
                    onSpeak={speak}
                  />
                ) : (
                  <p className="dictionary-empty">
                    No conjugated forms with person information are available.
                  </p>
                )}
              </DictionarySection>
            )}
          </>
        )}
      </article>
    </section>
  )
}

function WordOrigin({ entry }: { entry: DictionaryEntry }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        className="word-origin-button"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        WORD ORIGIN
      </button>
      <dialog
        className="word-origin-dialog"
        ref={dialogRef}
        aria-labelledby="word-origin-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="word-origin-content">
          <div className="word-origin-heading">
            <h3 id="word-origin-title">Word origin — {entry.lemma}</h3>
            <button
              className="small-icon-button"
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              aria-label="Close word origin"
            >
              <X size={18} />
            </button>
          </div>
          <p className="etymology-copy">{entry.etymology}</p>
        </div>
      </dialog>
    </>
  )
}

function DictionaryMeanings({
  entry,
  visibility,
  playingKey,
  onSpeak,
}: {
  entry: DictionaryEntry
  visibility: VisibilitySettings
  playingKey: string | null
  onSpeak: (sentence: string, key: string) => void
}) {
  const definitions = entry.definitions ?? []
  const linkedSentences = new Set(
    definitions.flatMap((item) => item.examples ?? []).map((item) => item.sentence),
  )
  const sharedExamples = (entry.examples ?? []).filter((item) => !linkedSentences.has(item.sentence))
  const renderExamples = (examples: Example[], prefix: string) => (
    <div className="sense-examples">
      {examples.map((example, index) => {
        const key = `${entry.id}-${prefix}-${index}`
        return (
          <div className="sense-example" key={key}>
            <button
              className="small-icon-button"
              type="button"
              onClick={() => onSpeak(example.sentence, key)}
              aria-label={`Play example: ${example.sentence}`}
            >
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
        <div className="meaning-layout">
          <div className="meaning-groups">
            {definitions.length > 0 &&
              (visibility.definitions || definitions.some((item) => item.examples?.length)) && (
                <DictionarySection title="Meanings" className="meaning-section">
                  <ol className="sense-list">
                    {definitions.map((definition, index) => (
                      <li className="sense-row" key={`${index}-${definition.meaning}`}>
                        {visibility.definitions && (
                          <div className="sense-definition">
                            <span className="sense-number">{String(index + 1).padStart(2, '0')}</span>
                            <div>
                              {definition.register && (
                                <span className="sense-register">{definition.register}</span>
                              )}
                              <p>{definition.meaning}</p>
                              {definition.translation && (
                                <p className="sense-translation">{definition.translation}</p>
                              )}
                            </div>
                          </div>
                        )}
                        {visibility.examples && definition.examples?.length
                          ? renderExamples(definition.examples, `sense-${index}`)
                          : null}
                      </li>
                    ))}
                  </ol>
                </DictionarySection>
              )}
            {visibility.definitions && !definitions.length && (
              <p className="dictionary-empty">No definitions are available for this entry.</p>
            )}
          </div>
          {visibility.examples && sharedExamples.length > 0 && (
            <DictionarySection title="Examples in context" className="word-examples">
              <div className="word-examples-body">
                <p className="examples-note">Examples for this word</p>
                <div
                  className="word-examples-scroll"
                  role="region"
                  aria-label="Scrollable examples"
                  tabIndex={0}
                >
                  {renderExamples(sharedExamples, 'word')}
                </div>
              </div>
            </DictionarySection>
          )}
        </div>
      )}
    </>
  )
}

function ConjugationGrid({
  entry,
  sections,
  playingKey,
  onSpeak,
}: {
  entry: DictionaryEntry
  sections: ConjugationSection[]
  playingKey: string | null
  onSpeak: (text: string, key: string) => void
}) {
  const subjects = subjectNames(entry.language)
  const nonFinite = [
    { label: 'Infinitive', form: entry.lemma, ipa: entry.ipa },
    {
      label: 'Present participle',
      form: entry.verb?.present_participle,
      ipa: entry.verb?.present_participle_ipa,
    },
    { label: 'Past participle', form: entry.verb?.past_participle, ipa: entry.verb?.past_participle_ipa },
  ].filter((item): item is { label: string; form: string; ipa: string | undefined } => Boolean(item.form))

  return (
    <div className="conjugation-scroll">
      {nonFinite.length > 0 && (
        <dl className="nonfinite-forms">
          {nonFinite.map((item) => {
            const playbackKey = `conjugation-${entry.id}-${item.label}`
            return (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  <button
                    className="conjugation-form-button"
                    type="button"
                    onClick={() => onSpeak(item.form, playbackKey)}
                    aria-label={`Play ${item.form}`}
                  >
                    <span>{item.form}</span>
                    {item.ipa && <small>{item.ipa}</small>}
                    {playingKey === playbackKey ? <Pause size={13} /> : <Volume2 size={13} />}
                  </button>
                </dd>
              </div>
            )
          })}
        </dl>
      )}
      <table className="conjugation-table">
        <caption>{entry.lemma} — conjugation</caption>
        <thead>
          <tr>
            <th rowSpan={2} scope="col">
              Mood
            </th>
            <th rowSpan={2} scope="col">
              Tense
            </th>
            <th colSpan={3} scope="colgroup">
              Singular
            </th>
            <th colSpan={3} scope="colgroup">
              Plural
            </th>
          </tr>
          <tr>
            {subjects.map((subject, slot) => (
              <th scope="col" key={slot}>
                {subject}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.flatMap((section) =>
            section.groups.map((group, index) => {
              const forms = new Map(group.forms.map((form) => [form.subject, form]))
              return (
                <tr key={`${section.mood}-${group.tense}`}>
                  {index === 0 && (
                    <th className="conjugation-mood" rowSpan={section.groups.length} scope="rowgroup">
                      {section.mood}
                    </th>
                  )}
                  <th className="conjugation-tense" scope="row">
                    {group.label}
                  </th>
                  {subjects.map((subject, slot) => {
                    const form = forms.get(subject)
                    const playbackKey = `conjugation-${entry.id}-${group.tense}-${subject}`
                    return (
                      <td key={slot}>
                        {form ? (
                          <button
                            className="conjugation-form-button"
                            type="button"
                            onClick={() => onSpeak(form.form, playbackKey)}
                            aria-label={`Play ${form.form}`}
                          >
                            <span>{form.form}</span>
                            {form.ipa && <small>{form.ipa}</small>}
                            {playingKey === playbackKey ? <Pause size={13} /> : <Volume2 size={13} />}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            }),
          )}
        </tbody>
      </table>
    </div>
  )
}

function DictionarySection({
  title,
  className = '',
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`dictionary-section ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}
