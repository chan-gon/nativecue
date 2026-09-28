import type { DictionaryEntry, ConjugationGroup } from './types'

export function subjectNames(language: string): string[] {
  return language.toLowerCase() === 'fr'
    ? ['je', 'tu', 'il / elle / on', 'nous', 'vous', 'ils / elles']
    : ['I', 'you', 'he / she / it', 'we', 'you', 'they']
}

// Slots preserve person AND number (including the two English "you" rows).
function subjectSlots(subject: string, language: string): number[] {
  const value = subject.trim().toLowerCase().replaceAll('’', "'")
  const persons = ['first-person', 'second-person', 'third-person']
    .map((tag, index) => (value.includes(tag) ? index : -1))
    .filter((index) => index >= 0)
  const numbers = ['singular', 'plural'].filter((tag) => value.includes(tag))
  if (persons.length && numbers.length) {
    return numbers.flatMap((number) => persons.map((person) => person + (number === 'plural' ? 3 : 0)))
  }
  const direct: Record<string, number[]> =
    language.toLowerCase() === 'fr'
      ? {
          je: [0],
          "j'": [0],
          tu: [1],
          il: [2],
          elle: [2],
          on: [2],
          nous: [3],
          vous: [4],
          ils: [5],
          elles: [5],
          'il/elle/on': [2],
          'il/elle': [2],
          'ils/elles': [5],
        }
      : { i: [0], you: [1, 4], he: [2], she: [2], it: [2], we: [3], they: [5], 'he/she/it': [2] }
  return direct[value.replace(/^(?:que\s+|qu')/, '').replaceAll(' ', '')] ?? []
}

function finiteConjugations(entry: DictionaryEntry | null): ConjugationGroup[] {
  if (!entry) return []
  const groups = new Map<string, { tense: string; subjects: Map<number, Map<string, Set<string>>> }>()
  for (const group of entry.verb?.groups ?? []) {
    if (/infinitive|participle|gerund|infinitif|participe|gérondif/i.test(group.tense)) continue
    // Merge identical tag sets even if the backend returns tags in another order.
    const key = group.tense
      .toLowerCase()
      .split('·')
      .map((tag) => tag.trim())
      .sort()
      .join('|')
    const merged = groups.get(key) ?? {
      tense: group.tense,
      subjects: new Map<number, Map<string, Set<string>>>(),
    }
    for (const form of group.forms) {
      const value = form.form.normalize('NFC').trim().replace(/\s+/g, ' ')
      const slots = subjectSlots(form.subject, entry.language)
      if (!value || !slots.length) continue
      for (const slot of slots) {
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
  return [...groups.values()].flatMap((group) => {
    const forms = [...group.subjects.entries()]
      .sort(([left], [right]) => left - right)
      .map(([slot, variants]) => ({
        subject: names[slot],
        form: [...variants.keys()].join(', '),
        ipa: [...variants.values()].flatMap((ipa) => [...ipa]).join(' / '),
      }))
    return forms.length ? [{ tense: group.tense, forms }] : []
  })
}

export interface ConjugationSection {
  mood: string
  groups: Array<ConjugationGroup & { label: string; order: number }>
}

export function organizeConjugations(entry: DictionaryEntry | null): ConjugationSection[] {
  const sections = new Map<string, ConjugationSection>()
  for (const group of finiteConjugations(entry)) {
    const tags = new Set(
      group.tense
        .toLowerCase()
        .split('·')
        .map((tag) => tag.trim()),
    )
    const mood = tags.has('indicative')
      ? 'Indicative'
      : tags.has('subjunctive')
        ? 'Subjunctive'
        : tags.has('conditional')
          ? 'Conditional'
          : tags.has('imperative')
            ? 'Imperative'
            : 'Other forms'
    const frenchLabel = tags.has('anterior')
      ? 'Passé antérieur'
      : tags.has('historic') && tags.has('past')
        ? 'Passé simple'
        : tags.has('pluperfect')
          ? 'Plus-que-parfait'
          : tags.has('future') && tags.has('perfect')
            ? 'Futur antérieur'
            : tags.has('conditional') && tags.has('perfect')
              ? 'Passé'
              : tags.has('imperfect')
                ? 'Imparfait'
                : tags.has('future')
                  ? 'Futur simple'
                  : tags.has('perfect') && tags.has('present')
                    ? 'Passé composé'
                    : tags.has('past')
                      ? 'Passé'
                      : tags.has('present')
                        ? 'Présent'
                        : group.tense.replaceAll(' · ', ' — ')
    const englishLabel = tags.has('pluperfect')
      ? 'Past perfect'
      : tags.has('future') && tags.has('perfect')
        ? 'Future perfect'
        : tags.has('past') && tags.has('perfect')
          ? 'Past perfect'
          : tags.has('present') && tags.has('perfect')
            ? 'Present perfect'
            : tags.has('future')
              ? 'Future'
              : tags.has('past')
                ? 'Past'
                : tags.has('present')
                  ? 'Present'
                  : group.tense.replaceAll(' · ', ' — ')
    const label = entry?.language.toLowerCase() === 'en' ? englishLabel : frenchLabel
    const order = tags.has('present')
      ? 10
      : tags.has('imperfect') || tags.has('pluperfect')
        ? 20
        : tags.has('past') || tags.has('anterior')
          ? 30
          : tags.has('future')
            ? 40
            : 50
    const section = sections.get(mood) ?? { mood, groups: [] }
    section.groups.push({ ...group, label, order })
    sections.set(mood, section)
  }
  const moodOrder = ['Indicative', 'Subjunctive', 'Conditional', 'Imperative', 'Other forms']
  return [...sections.values()]
    .map((section) => ({
      ...section,
      groups: section.groups.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => moodOrder.indexOf(a.mood) - moodOrder.indexOf(b.mood))
}
