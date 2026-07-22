import unittest
from unittest.mock import patch

import llm_bridge_server as bridge


class LlmBridgeTests(unittest.TestCase):
    def test_openai_compatible_urls_accept_root_v1_or_full_path(self):
        expected = "http://127.0.0.1:1234/v1/chat/completions"
        self.assertEqual(bridge.llm_api_url("http://127.0.0.1:1234", "lmstudio", "chat"), expected)
        self.assertEqual(bridge.llm_api_url("http://localhost:1234/v1", "lmstudio", "chat"), "http://localhost:1234/v1/chat/completions")
        self.assertEqual(bridge.llm_api_url(expected, "openai-compatible", "chat"), expected)
        self.assertEqual(
            bridge.llm_api_url("http://127.0.0.1:1234/v1/models", "lmstudio", "chat"),
            expected,
        )

    def test_ollama_urls_accept_root_api_or_full_path(self):
        expected = "http://127.0.0.1:11434/api/chat"
        self.assertEqual(bridge.llm_api_url("http://127.0.0.1:11434", "ollama", "chat"), expected)
        self.assertEqual(bridge.llm_api_url("http://127.0.0.1:11434/api", "ollama", "chat"), expected)
        self.assertEqual(bridge.llm_api_url(expected, "ollama", "chat"), expected)
        self.assertEqual(bridge.llm_api_url("http://127.0.0.1:11434/api/tags", "ollama", "chat"), expected)

    def test_non_loopback_and_credentialed_endpoints_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "loopback"):
            bridge.llm_api_url("http://192.168.1.40:1234", "lmstudio", "models")
        with self.assertRaisesRegex(ValueError, "credentials"):
            bridge.llm_api_url("http://user:pass@127.0.0.1:1234", "lmstudio", "models")

    def test_sentence_trimming_does_not_cut_at_abbreviations(self):
        reply = "Keep the tone specific. Try a concrete quality (e.g., gentle confidence) next. Ignore this third sentence."
        self.assertEqual(
            bridge.trim_sentences(reply, 2),
            "Keep the tone specific. Try a concrete quality (e.g., gentle confidence) next.",
        )

    def test_feedback_prompt_names_and_repeats_the_actual_spoken_script(self):
        prompt = bridge.build_feedback_user_prompt(
            {"record": {"text": "Turn the lantern down; let the room grow quiet.", "seed": 31420}}
        )
        self.assertIn("ACTUAL SPOKEN SCRIPT", prompt)
        self.assertIn("3-to-8-word exact quote", prompt)
        self.assertIn("Turn the lantern down; let the room grow quiet.", prompt)
        self.assertIn('"spoken_script": "Turn the lantern down; let the room grow quiet."', prompt)

    @patch.object(bridge, "get_json")
    def test_model_discovery_supports_lm_studio_and_ollama(self, get_json):
        get_json.return_value = {"data": [{"id": "loaded-lm-studio-model"}]}
        self.assertEqual(
            bridge.discover_llm_models("lmstudio", "http://127.0.0.1:1234"),
            ["loaded-lm-studio-model"],
        )
        get_json.return_value = {"models": [{"name": "qwen2.5:3b"}]}
        self.assertEqual(
            bridge.discover_llm_models("ollama", "http://127.0.0.1:11434"),
            ["qwen2.5:3b"],
        )

    @patch.object(bridge, "post_json")
    @patch.object(bridge, "get_json")
    def test_blank_model_is_discovered_before_feedback(self, get_json, post_json):
        get_json.return_value = {"data": [{"id": "discovered-model"}]}
        post_json.return_value = {
            "choices": [{"message": {"content": "Keep the seed fixed. Shorten the delivery note."}}]
        }
        reply, model = bridge.local_llm_feedback(
            {
                "provider": "lmstudio",
                "endpoint": "http://127.0.0.1:1234/v1",
                "model": "",
                "record": {"filename": "take.wav", "seed": 42},
            }
        )
        self.assertEqual(model, "discovered-model")
        self.assertEqual(reply, "Keep the seed fixed. Shorten the delivery note.")
        request_url, request_payload = post_json.call_args.args[:2]
        self.assertEqual(request_url, "http://127.0.0.1:1234/v1/chat/completions")
        self.assertEqual(request_payload["model"], "discovered-model")


if __name__ == "__main__":
    unittest.main()
