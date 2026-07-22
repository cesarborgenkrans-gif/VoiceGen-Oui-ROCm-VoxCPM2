import unittest
from unittest.mock import patch

import server


class LocalLlmFeedbackTests(unittest.TestCase):
    def test_openai_compatible_urls_accept_root_v1_or_full_path(self):
        expected = "http://127.0.0.1:1234/v1/chat/completions"
        self.assertEqual(server.llm_api_url("http://127.0.0.1:1234", "lmstudio", "chat"), expected)
        self.assertEqual(server.llm_api_url("http://127.0.0.1:1234/v1", "lmstudio", "chat"), expected)
        self.assertEqual(server.llm_api_url(expected, "openai-compatible", "chat"), expected)

    def test_ollama_urls_accept_root_api_or_full_path(self):
        expected = "http://127.0.0.1:11434/api/chat"
        self.assertEqual(server.llm_api_url("http://127.0.0.1:11434", "ollama", "chat"), expected)
        self.assertEqual(server.llm_api_url("http://127.0.0.1:11434/api", "ollama", "chat"), expected)
        self.assertEqual(server.llm_api_url(expected, "ollama", "chat"), expected)

    @patch.object(server, "get_json")
    def test_model_discovery_supports_lm_studio_and_ollama(self, get_json):
        get_json.return_value = {"data": [{"id": "loaded-lm-studio-model"}]}
        self.assertEqual(
            server.discover_llm_models("lmstudio", "http://127.0.0.1:1234"),
            ["loaded-lm-studio-model"],
        )
        get_json.return_value = {"models": [{"name": "qwen2.5:3b"}]}
        self.assertEqual(
            server.discover_llm_models("ollama", "http://127.0.0.1:11434"),
            ["qwen2.5:3b"],
        )

    @patch.object(server, "post_json")
    @patch.object(server, "get_json")
    def test_blank_model_is_discovered_before_feedback(self, get_json, post_json):
        get_json.return_value = {"data": [{"id": "discovered-model"}]}
        post_json.return_value = {
            "choices": [{"message": {"content": "Keep the seed fixed. Shorten the delivery note."}}]
        }
        reply, model = server.local_llm_feedback({
            "provider": "lmstudio",
            "endpoint": "http://127.0.0.1:1234/v1",
            "model": "",
            "record": {"filename": "take.wav", "seed": 42},
        })
        self.assertEqual(model, "discovered-model")
        self.assertEqual(reply, "Keep the seed fixed. Shorten the delivery note.")
        request_url, request_payload = post_json.call_args.args[:2]
        self.assertEqual(request_url, "http://127.0.0.1:1234/v1/chat/completions")
        self.assertEqual(request_payload["model"], "discovered-model")


if __name__ == "__main__":
    unittest.main()
