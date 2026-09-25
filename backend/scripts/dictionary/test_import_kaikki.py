import unittest

from import_kaikki import is_lemma, search_key, usable_forms


class ImportHelpersTest(unittest.TestCase):
    def test_search_key_preserves_original_separately_and_normalizes_lookup(self):
        self.assertEqual(search_key("NOUVELLE"), "nouvelle")
        self.assertEqual(search_key("l’œuvre"), "l'œuvre")

    def test_non_lemma_category(self):
        self.assertFalse(is_lemma({"categories": ["French non-lemma forms"]}))
        self.assertTrue(is_lemma({"categories": ["French lemmas"]}))

    def test_usable_forms_skips_table_metadata_and_deduplicates(self):
        forms = usable_forms({"forms": [
            {"form": "fr-conj-auto", "tags": ["inflection-template"]},
            {"form": "no-table-tags", "tags": ["table-tags"]},
            {"form": "achète", "tags": ["present"]},
            {"form": "ACHÈTE", "tags": ["present"]},
            {"form": "-", "tags": ["plural"]},
        ]})
        self.assertEqual(forms, [{"form": "achète", "form_key": "achète", "tags": ["present"]}])


if __name__ == "__main__":
    unittest.main()
