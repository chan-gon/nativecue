import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

import natural_speech

def make_result():
    return natural_speech.NaturalSpeechOutput(
        cues=[
            natural_speech.NaturalSpeechCue(
                type="liaison",
                start_word=0,
                end_word=1,
                display="vous avez",
                explanation="Test liaison.",
            )
        ]
    )

def register_cache_key(
    cleanup_cache,
    text,
    language="fr",
):
    cache_key = natural_speech.create_cache_key(
        text=natural_speech.normalize_text(text),
        language=language,
        model=natural_speech.MODEL,
        prompt_version=natural_speech.PROMPT_VERSIONS[language],
    )

    cleanup_cache.append(cache_key)

    return cache_key

def run_concurrently(texts):
    with ThreadPoolExecutor(
        max_workers=len(texts)
    ) as executor:
        futures = [
            executor.submit(
                natural_speech.analyze_natural_speech,
                text,
                "fr",
            )
            for text in texts
        ]

        return [
            future.result()
            for future in futures
        ]

def test_same_request_calls_openai_once(
    monkeypatch,
    unique_text,
    cleanup_cache,
):
    register_cache_key(
        cleanup_cache,
        unique_text,
    )

    call_count = 0
    call_count_lock = threading.Lock()

    def fake_openai(*args, **kwargs):
        nonlocal call_count

        with call_count_lock:
            call_count += 1

        # 다른 요청들이 첫 cache MISS까지 도달할 시간 확보
        time.sleep(0.3)

        return make_result()

    monkeypatch.setattr(
        natural_speech,
        "call_openai",
        fake_openai,
    )

    results = run_concurrently(
        [unique_text] * 3
    )

    assert len(results) == 3
    assert call_count == 1
    assert results[0] == results[1] == results[2]


def test_cache_hit_does_not_call_openai(
    monkeypatch,
    unique_text,
    cleanup_cache,
):
    register_cache_key(
        cleanup_cache,
        unique_text,
    )

    call_count = 0

    def fake_openai(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return make_result()

    monkeypatch.setattr(
        natural_speech,
        "call_openai",
        fake_openai,
    )

    # 첫 번째 호출 → Cache MISS → 저장
    first_result = natural_speech.analyze_natural_speech(
        unique_text,
        "fr",
    )

    assert call_count == 1

    # 지금부터 다시 측정
    call_count = 0

    # 두 번째 호출 → Cache HIT
    second_result = natural_speech.analyze_natural_speech(
        unique_text,
        "fr",
    )

    assert call_count == 0
    assert second_result == first_result


def test_different_requests_do_not_block_each_other(
    monkeypatch,
    cleanup_cache,
):
    texts = [
        "Bonjour test concurrent A",
        "Vous avez test concurrent B",
        "Je voudrais test concurrent C",
    ]

    # 이전 pytest 실행 결과와 충돌하지 않도록 suffix
    import uuid

    suffix = str(uuid.uuid4())

    texts = [
        f"{text} {suffix}"
        for text in texts
    ]

    for text in texts:
        register_cache_key(
            cleanup_cache,
            text,
        )

    barrier = threading.Barrier(3)
    call_count = 0
    call_count_lock = threading.Lock()

    def fake_openai(*args, **kwargs):
        nonlocal call_count

        with call_count_lock:
            call_count += 1

        # 세 OpenAI 호출이 동시에 이 위치에 도달해야 함.
        # global lock이라면 timeout 발생.
        barrier.wait(timeout=2)

        return make_result()

    monkeypatch.setattr(
        natural_speech,
        "call_openai",
        fake_openai,
    )

    results = run_concurrently(texts)

    assert len(results) == 3
    assert call_count == 3


def test_same_request_times_out_when_openai_is_slow(
    monkeypatch,
    unique_text,
    cleanup_cache,
):
    register_cache_key(
        cleanup_cache,
        unique_text,
    )

    original_acquire = natural_speech.acquire_cache_lock

    def fast_timeout_lock(conn, lock_id):
        return original_acquire(
            conn,
            lock_id,
            timeout=0.2,
        )

    openai_started = threading.Event()

    def slow_openai(*args, **kwargs):
        openai_started.set()

        time.sleep(0.6)

        return make_result()

    monkeypatch.setattr(
        natural_speech,
        "acquire_cache_lock",
        fast_timeout_lock,
    )

    monkeypatch.setattr(
        natural_speech,
        "call_openai",
        slow_openai,
    )

    with ThreadPoolExecutor(
        max_workers=2
    ) as executor:

        first = executor.submit(
            natural_speech.analyze_natural_speech,
            unique_text,
            "fr",
        )

        # 첫 번째 요청이 OpenAI에 진입했다는 것을 확인한 뒤
        # 두 번째 동일 요청을 보냄
        assert openai_started.wait(timeout=1)

        second = executor.submit(
            natural_speech.analyze_natural_speech,
            unique_text,
            "fr",
        )

        with pytest.raises(TimeoutError):
            second.result()

        first_result = first.result()

    assert first_result["language"] == "fr"


def test_lock_is_released_when_openai_fails(
    monkeypatch,
    unique_text,
    cleanup_cache,
):
    register_cache_key(
        cleanup_cache,
        unique_text,
    )

    def failing_openai(*args, **kwargs):
        raise RuntimeError(
            "Simulated OpenAI failure"
        )

    monkeypatch.setattr(
        natural_speech,
        "call_openai",
        failing_openai,
    )

    with pytest.raises(
        RuntimeError,
        match="Simulated OpenAI failure",
    ):
        natural_speech.analyze_natural_speech(
            unique_text,
            "fr",
        )

    # 첫 요청 실패 후 같은 cache_key를 다시 요청한다.
    # 이전 advisory lock이 남아 있다면 정상 처리되지 않는다.
    monkeypatch.setattr(
        natural_speech,
        "call_openai",
        lambda *args, **kwargs: make_result(),
    )

    result = natural_speech.analyze_natural_speech(
        unique_text,
        "fr",
    )

    assert result["language"] == "fr"
    assert len(result["cues"]) == 1