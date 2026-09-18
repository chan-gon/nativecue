import uuid
import pytest
from database import get_connection

@pytest.fixture
def unique_text():
    return f"pytest natural speech {uuid.uuid4()}"


@pytest.fixture
def cleanup_cache():
    cache_keys = []

    yield cache_keys

    if not cache_keys:
        return

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM natural_speech_cache
                WHERE cache_key = ANY(%s)
                """,
                (cache_keys,),
            )

        conn.commit()