import { useState, useRef, useCallback } from 'react';

interface PhoneticChunk {
    id: number;
    text: string;
    stressed: number[]; // indices of stressed syllables in words array
    words: string[];
    liaison: boolean; // has liaison link to the next chunk
    pause: string | null; // pause badge text
}

interface Sentence {
    text: string;
    chunks: PhoneticChunk[];
    nativeAudioLabel: string;
}

const LANGUAGES = ['EN', 'FR'];

const STARTER_TAGS = [
    { label: '#Job Interview', sentence: "I'd love the opportunity to grow with your team."},
    { label: '#Café Order', sentence: "Could I get a flat white with oat milk, please?" },
    { label: '#Casual Banter', sentence: "That's actually a pretty solid idea, you know?" },
    { label: '#Movie Lines', sentence: "After all this time? Always." },
    { label: '#First Meeting', sentence: "Great to finally put a face to the name." },
    { label: '#Phone Call', sentence: "Sorry, could you say that one more time for me?" },
];

function parseSentence(text: String): PhoneticChunk[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const words = trimmed.split(/\s+/);
    const chunkSize = Math.ceil(words.length / Math.min(4, Math.max(2, Math.ceil(words.length / 3))));
    const rawChunks: string[][] = [];
    for (let i = 0; i < words.length; i += chunkSize) {
        rawChunks.push(words.slice(i, i + chunkSize));
    }

    const pauses = ['0.3s', null, '0.5s', null];
    return rawChunks.map((ws, idx) => ({
        id: idx,
        text: ws.join(' '),
        words: ws,
        stressed: [0], // first word is stressed by default
        liaison: idx < rawChunks.length - 1 && idx % 2 === 0,
        pause: idx < rawChunks.length - 1 ? pauses[idx % 4] : null,
    }));
}

function ChunkCard({
   chunk,
   isLast,
   active,
}: {
    chunk: PhoneticChunk
    isLast: boolean
    active: boolean
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {/* Card */}
            <div
                style={{
                    position: 'relative',
                    background: active ? '#EBF2FF' : '#FFFFFF',
                    border: `1.5px solid ${active ? '#0066FF' : '#E4E6EB'}`,
                    borderRadius: 10,
                    padding: '18px 22px 22px',
                    minWidth: 140,
                    flex: 1,
                    transition: 'all 0.2s ease',
                    boxShadow: active ? '0 0 0 3px rgba(0,102,255,0.10)' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
            >
                {/* Chunk label */}
                <div
                    style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        color: active ? '#0066FF' : '#8B90A0',
                        textTransform: 'uppercase',
                        marginBottom: 10,
                        fontWeight: 500,
                    }}
                >
                    Chunk {chunk.id + 1}
                </div>

                {/* Words with stress marks */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', marginBottom: 10 }}>
                    {chunk.words.map((word, wi) => {
                        const isStressed = chunk.stressed.includes(wi)
                        return (
                            <span
                                key={wi}
                                style={{
                                    fontSize: 18,
                                    fontWeight: isStressed ? 700 : 400,
                                    color: isStressed ? '#111318' : '#444954',
                                    letterSpacing: isStressed ? '-0.02em' : '0',
                                    borderBottom: isStressed ? '2.5px solid #0066FF' : 'none',
                                    paddingBottom: isStressed ? 1 : 0,
                                }}
                            >
                {word}
              </span>
                        )
                    })}
                </div>

                {/* Liaison arc indicator */}
                {chunk.liaison && !isLast && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -18,
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <svg width="36" height="14" viewBox="0 0 36 14" fill="none">
                            <path
                                d="M2 2 Q18 14 34 2"
                                stroke="#0066FF"
                                strokeWidth="1.5"
                                strokeDasharray="3 2"
                                fill="none"
                                opacity="0.5"
                            />
                        </svg>
                    </div>
                )}
            </div>

            {/* Pause badge between chunks */}
            {!isLast && chunk.pause && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 12px',
                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            background: '#F0F1F4',
                            border: '1px solid #E4E6EB',
                            borderRadius: 20,
                            padding: '3px 9px',
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 10,
                            color: '#8B90A0',
                            whiteSpace: 'nowrap',
                            fontWeight: 500,
                        }}
                    >
                        {chunk.pause}
                    </div>
                    <div style={{ width: 1, height: 6, background: '#E4E6EB', marginTop: 3 }} />
                </div>
            )}

            {!isLast && !chunk.pause && (
                <div style={{ width: 16, flexShrink: 0 }} />
            )}
        </div>
    )
}

function Waveform({ active }: { active: boolean }) {
    const bars = [3, 7, 5, 9, 6, 4, 8, 5, 10, 6, 4, 7, 9, 5, 3]
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24 }}>
            {bars.map((h, i) => (
                <div
                    key={i}
                    className={active ? 'wave-bar' : ''}
                    style={{
                        width: 3,
                        height: `${(h / 10) * 100}%`,
                        background: active ? '#0066FF' : '#D0D3DC',
                        borderRadius: 2,
                        animationDelay: `${i * 0.07}s`,
                        transition: 'background 0.3s',
                    }}
                />
            ))}
        </div>
    )
}

function App() {
    const [inputText, setInputText] = useState('');
    const [sentence, setSentence] = useState<Sentence | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<'1.0x' | '0.8x' | '0.6x'>('1.0x');
    const [score, setScore] = useState<number | null>(null);
    const [saved, setSaved] = useState(false);
    const [deckCount, setDeckCount] = useState(0);
    const [activeLang, setActiveLang] = useState('EN');
    const [langOpen, setLangOpen] = useState(false);
    const [activeChunk, setActiveChunk] = useState<number | null>(null);

    const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const analyze = useCallback((text: string) => {
        if (!text.trim()) return
        const chunks = parseSentence(text)
        setSentence({ text, chunks, nativeAudioLabel: 'Native Speaker · EN' })
        setScore(null)
        setSaved(false)
        setActiveChunk(null)
    }, [])

    const handleSubmit = () => analyze(inputText)

    const handleTagClick = (s: string) => {
        setInputText(s)
        analyze(s)
    }

    const handleRecord = () => {
        if (isRecording) {
            setIsRecording(false)
            if (recordTimerRef.current) clearTimeout(recordTimerRef.current)
            // Simulate score after recording
            setTimeout(() => {
                const s = 72 + Math.floor(Math.random() * 22)
                setScore(s)
            }, 600)
        } else {
            setIsRecording(true)
            setScore(null)
            // Simulate chunk activation during recording
            let ci = 0
            const chunks = sentence?.chunks ?? []
            const step = () => {
                setActiveChunk(ci)
                ci++
                if (ci < chunks.length) {
                    recordTimerRef.current = setTimeout(step, 900)
                } else {
                    recordTimerRef.current = setTimeout(() => {
                        setActiveChunk(null)
                        setIsRecording(false)
                        setTimeout(() => setScore(72 + Math.floor(Math.random() * 22)), 400)
                    }, 600)
                }
            }
            step()
        }
    }

    const handlePlay = () => {
        setIsPlaying(true)
        setTimeout(() => setIsPlaying(false), 2200)
    }

    const cycleSpeed = () => {
        setSpeed(s => s === '1.0x' ? '0.8x' : s === '0.8x' ? '0.6x' : '1.0x')
    }

    const handleSave = () => {
        if (!saved) {
            setSaved(true)
            setDeckCount(c => c + 1)
        }
    }

    const feedbackTip =
        score !== null
            ? score >= 90
                ? 'Excellent rhythm — your timing and stress placement are spot on.'
                : score >= 78
                    ? 'Shorten the pause between Chunk 1 and Chunk 2 by 0.2s for a smoother flow.'
                    : 'Try lengthening the stressed syllable in Chunk 1 — hold it about 0.3s longer.'
            : null

    const speedSpeeds: Record<string, string> = { '1.0x': '1.0x Speed', '0.8x': '0.8x Speed', '0.6x': '0.6x Speed' }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#F7F8FA',
                fontFamily: "'Inter', system-ui, sans-serif",
                WebkitFontSmoothing: 'antialiased',
            }}
        >
            {/* ── Navbar ─────────────────────────────────────────────────────── */}
            <nav
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 32px',
                    height: 60,
                    background: '#FFFFFF',
                    borderBottom: '1px solid #E4E6EB',
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                }}
            >
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 30,
                            height: 30,
                            background: '#0066FF',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 11 Q8 3 13 11" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
                            <circle cx="8" cy="11" r="1.5" fill="white" />
                        </svg>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.03em', color: '#111318' }}>
            nativecue
          </span>
                </div>

                {/* Right controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Language selector */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setLangOpen(o => !o)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                background: 'transparent',
                                border: '1px solid #E4E6EB',
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: 13,
                                fontWeight: 500,
                                color: '#444954',
                                cursor: 'pointer',
                                fontFamily: "'DM Mono', monospace",
                            }}
                        >
                            {activeLang}
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                <path d="M1 1L5 5L9 1" stroke="#8B90A0" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </button>
                        {langOpen && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '110%',
                                    right: 0,
                                    background: '#FFFFFF',
                                    border: '1px solid #E4E6EB',
                                    borderRadius: 10,
                                    padding: 6,
                                    zIndex: 100,
                                    minWidth: 80,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                                }}
                            >
                                {LANGUAGES.map(l => (
                                    <button
                                        key={l}
                                        onClick={() => { setActiveLang(l); setLangOpen(false) }}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '7px 12px',
                                            background: l === activeLang ? '#EBF2FF' : 'transparent',
                                            border: 'none',
                                            borderRadius: 6,
                                            fontSize: 13,
                                            fontWeight: l === activeLang ? 600 : 400,
                                            color: l === activeLang ? '#0066FF' : '#444954',
                                            cursor: 'pointer',
                                            fontFamily: "'DM Mono', monospace",
                                        }}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* My Speech Deck pill */}
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            background: deckCount > 0 ? '#EBF2FF' : '#F0F1F4',
                            border: `1px solid ${deckCount > 0 ? '#CCE0FF' : '#E4E6EB'}`,
                            borderRadius: 20,
                            padding: '7px 14px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: deckCount > 0 ? '#0066FF' : '#8B90A0',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <rect x="1" y="3" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M4 3V2a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                        My Speech Deck ({deckCount})
                    </button>
                </div>
            </nav>

            {/* ── Body ───────────────────────────────────────────────────────── */}
            <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>

                {/* ── Input Section ───────────────────────────────────────────── */}
                <section style={{ marginBottom: 36 }}>
                    <div
                        style={{
                            background: '#FFFFFF',
                            border: '1.5px solid #E4E6EB',
                            borderRadius: 12,
                            overflow: 'hidden',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={() => {}}
                    >
            <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="Enter a sentence you want to master today..."
                style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    padding: '20px 20px 14px',
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: '#111318',
                    background: 'transparent',
                    resize: 'none',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    minHeight: 90,
                }}
                rows={3}
            />
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                borderTop: '1px solid #F0F1F4',
                                background: '#FAFBFC',
                            }}
                        >
              <span style={{ fontSize: 12, color: '#8B90A0' }}>
                Press Enter or click Analyze →
              </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #E4E6EB',
                                        borderRadius: 7,
                                        padding: '7px 13px',
                                        fontSize: 13,
                                        color: '#444954',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                    }}
                                >
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                        <path d="M6.5 1v11M1 6.5h11" stroke="#8B90A0" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    Import Sentence
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!inputText.trim()}
                                    style={{
                                        background: inputText.trim() ? '#0066FF' : '#E4E6EB',
                                        border: 'none',
                                        borderRadius: 7,
                                        padding: '7px 16px',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: inputText.trim() ? '#FFFFFF' : '#8B90A0',
                                        cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    Analyze →
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Starter Cards */}
                    <div style={{ marginTop: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 12, color: '#8B90A0', fontWeight: 500 }}>⚡ 3-Second Quick Try</span>
                        </div>
                        <div
                            className="scroll-hidden"
                            style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}
                        >
                            {STARTER_TAGS.map(tag => (
                                <button
                                    key={tag.label}
                                    onClick={() => handleTagClick(tag.sentence)}
                                    style={{
                                        flexShrink: 0,
                                        background: '#FFFFFF',
                                        border: '1px solid #E4E6EB',
                                        borderRadius: 20,
                                        padding: '7px 14px',
                                        fontSize: 12,
                                        fontWeight: 500,
                                        color: '#444954',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                        const el = e.currentTarget
                                        el.style.borderColor = '#0066FF'
                                        el.style.color = '#0066FF'
                                        el.style.background = '#EBF2FF'
                                    }}
                                    onMouseLeave={e => {
                                        const el = e.currentTarget
                                        el.style.borderColor = '#E4E6EB'
                                        el.style.color = '#444954'
                                        el.style.background = '#FFFFFF'
                                    }}
                                >
                                    {tag.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Visual Tuning Studio ─────────────────────────────────────── */}
                {sentence && (
                    <>
                        <section
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #E4E6EB',
                                borderRadius: 14,
                                overflow: 'hidden',
                                marginBottom: 16,
                                boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                            }}
                        >
                            {/* Studio header */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '16px 22px',
                                    borderBottom: '1px solid #F0F1F4',
                                    background: '#FAFBFC',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: '50%',
                                            background: isRecording ? '#0066FF' : '#D0D3DC',
                                            boxShadow: isRecording ? '0 0 0 3px rgba(0,102,255,0.2)' : 'none',
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 11,
                                            fontWeight: 500,
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            color: '#8B90A0',
                                        }}
                                    >
                    Visual Tuning Studio
                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Waveform active={isPlaying || isRecording} />
                                    <span
                                        style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 11,
                                            color: '#8B90A0',
                                        }}
                                    >
                    {sentence.chunks.length} chunks · {activeLang}
                  </span>
                                </div>
                            </div>

                            {/* Phonetic Chunk Cards */}
                            <div style={{ padding: '28px 22px 24px' }}>
                                <div
                                    className="scroll-hidden"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 0,
                                        overflowX: 'auto',
                                        paddingBottom: 8,
                                    }}
                                >
                                    {sentence.chunks.map((chunk, idx) => (
                                        <ChunkCard
                                            key={chunk.id}
                                            chunk={chunk}
                                            isLast={idx === sentence.chunks.length - 1}
                                            active={activeChunk === idx}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Audio Control Bar */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 14,
                                    padding: '18px 22px',
                                    borderTop: '1px solid #F0F1F4',
                                    background: '#FAFBFC',
                                }}
                            >
                                {/* Play Native Audio */}
                                <button
                                    onClick={handlePlay}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: '#FFFFFF',
                                        border: '1.5px solid #E4E6EB',
                                        borderRadius: 9,
                                        padding: '10px 18px',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: isPlaying ? '#0066FF' : '#444954',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        borderColor: isPlaying ? '#0066FF' : '#E4E6EB',
                                    }}
                                >
                                    {isPlaying ? (
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                            <rect x="2" y="2" width="4" height="10" rx="1" fill="#0066FF" />
                                            <rect x="8" y="2" width="4" height="10" rx="1" fill="#0066FF" />
                                        </svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                            <path d="M3 2L12 7L3 12V2Z" fill="#444954" />
                                        </svg>
                                    )}
                                    {isPlaying ? 'Playing...' : 'Play Native Audio'}
                                </button>

                                {/* Mic Button */}
                                <button
                                    onClick={handleRecord}
                                    style={{
                                        position: 'relative',
                                        width: 54,
                                        height: 54,
                                        borderRadius: '50%',
                                        background: isRecording ? '#0066FF' : '#111318',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: isRecording
                                            ? '0 0 0 6px rgba(0,102,255,0.18), 0 4px 20px rgba(0,102,255,0.35)'
                                            : '0 4px 14px rgba(0,0,0,0.22)',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {isRecording && <span className="mic-pulse" />}
                                    <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                                        <rect x="6" y="1" width="8" height="13" rx="4" fill="white" />
                                        <path d="M2 10c0 4.418 3.582 8 8 8s8-3.582 8-8" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                        <line x1="10" y1="18" x2="10" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </button>

                                {/* Speed toggle */}
                                <button
                                    onClick={cycleSpeed}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        background: speed !== '1.0x' ? '#EBF2FF' : '#FFFFFF',
                                        border: `1.5px solid ${speed !== '1.0x' ? '#0066FF' : '#E4E6EB'}`,
                                        borderRadius: 9,
                                        padding: '10px 16px',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: speed !== '1.0x' ? '#0066FF' : '#444954',
                                        cursor: 'pointer',
                                        fontFamily: "'DM Mono', monospace",
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                        <path d="M7 1v6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
                                    </svg>
                                    🔄 {speedSpeeds[speed]}
                                </button>
                            </div>
                        </section>

                        {/* ── Rhythm Match & Feedback ─────────────────────────────── */}
                        <section
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #E4E6EB',
                                borderRadius: 14,
                                padding: '22px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                            }}
                        >
                            {/* Score row */}
                            <div style={{ marginBottom: 18 }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 10,
                                    }}
                                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#444954' }}>
                    Rhythm Match
                  </span>
                                    <span
                                        style={{
                                            fontFamily: "'DM Mono', monospace",
                                            fontSize: 22,
                                            fontWeight: 500,
                                            color: score !== null
                                                ? score >= 90 ? '#00AA66' : score >= 75 ? '#0066FF' : '#F06030'
                                                : '#D0D3DC',
                                            letterSpacing: '-0.03em',
                                            transition: 'color 0.4s',
                                        }}
                                    >
                    {score !== null ? `${score}%` : '—%'}
                  </span>
                                </div>
                                <div
                                    style={{
                                        height: 7,
                                        background: '#F0F1F4',
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        className={score !== null && score > 0 ? 'score-shimmer' : ''}
                                        style={{
                                            height: '100%',
                                            width: `${score ?? 0}%`,
                                            borderRadius: 4,
                                            background: score === null ? '#D0D3DC' : undefined,
                                            transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                        }}
                                    />
                                </div>
                                {score === null && (
                                    <p style={{ fontSize: 12, color: '#8B90A0', marginTop: 8 }}>
                                        Record your speech to see your rhythm match score.
                                    </p>
                                )}
                            </div>

                            {/* Micro-feedback */}
                            {feedbackTip && (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 10,
                                        background: '#F7F8FA',
                                        border: '1px solid #E4E6EB',
                                        borderRadius: 9,
                                        padding: '12px 14px',
                                        marginBottom: 18,
                                    }}
                                >
                                    <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>💡</span>
                                    <p style={{ fontSize: 13, color: '#444954', lineHeight: 1.5, margin: 0 }}>
                                        {feedbackTip}
                                    </p>
                                </div>
                            )}

                            {/* Save CTA */}
                            <button
                                onClick={handleSave}
                                disabled={saved}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 9,
                                    background: saved ? '#F0F1F4' : '#0066FF',
                                    border: 'none',
                                    borderRadius: 10,
                                    padding: '15px 20px',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: saved ? '#8B90A0' : '#FFFFFF',
                                    cursor: saved ? 'default' : 'pointer',
                                    letterSpacing: '-0.01em',
                                    transition: 'all 0.25s',
                                    boxShadow: saved ? 'none' : '0 4px 16px rgba(0,102,255,0.30)',
                                }}
                            >
                                {saved ? (
                                    <>
                                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                                            <path d="M3 7.5L6.5 11L12 4" stroke="#00AA66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Saved to Speech Deck
                                    </>
                                ) : (
                                    <>
                                        <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                                            <path d="M2 2h10a1 1 0 011 1v11l-6-3-6 3V3a1 1 0 011-1z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
                                        </svg>
                                        Save to My Speech Deck
                                    </>
                                )}
                            </button>
                        </section>
                    </>
                )}

                {/* Empty state */}
                {!sentence && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '64px 24px',
                            color: '#8B90A0',
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                width: 52,
                                height: 52,
                                background: '#F0F1F4',
                                borderRadius: 14,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <svg width="22" height="24" viewBox="0 0 22 24" fill="none">
                                <rect x="7" y="1" width="8" height="14" rx="4" stroke="#D0D3DC" strokeWidth="1.8" />
                                <path d="M2 12c0 5 4 9 9 9s9-4 9-9" stroke="#D0D3DC" strokeWidth="1.8" strokeLinecap="round" />
                                <line x1="11" y1="21" x2="11" y2="23" stroke="#D0D3DC" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: '#8B90A0', margin: 0 }}>
                            Enter a sentence above or pick a quick-try tag to begin.
                        </p>d
                    </div>
                )}
            </main>
        </div>
    )
}

export default App
