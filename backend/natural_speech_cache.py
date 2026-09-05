import json

from database import get_connection

def find_cached_analysis(cache_key: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT analysis
                FROM natural_speech_cache
                WHERE cache_key = %s
                """, (cache_key)
            )

            row = cursor.fetchone()

        if row is None:
            return None

        return row[0]

