"""Inference for pocket-voice-complete.

Predicts whether a transcribed utterance is semantically COMPLETE
(a finished thought / command) or INCOMPLETE (trailed off, cut mid-phrase).

Usage:
    from inference import CompletenessPredictor
    p = CompletenessPredictor("path/to/pocket-voice-complete")
    print(p.predict("turn on the kitchen"))   # {'complete': False, 'score': 0.03}
    print(p.predict("turn on the kitchen lights"))  # {'complete': True, 'score': 0.99}

Designed to plug into the Pocket Voice turn-taking stack: combine with the
acoustic VAD — only treat a pause as end-of-turn when BOTH the VAD sees
silence AND this model says the utterance is complete.
"""
import json
import math
import os

import torch
import torch.nn as nn


class _SinusoidalPositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 128):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x):
        return x + self.pe[:, : x.size(1)]


class _PocketVoiceComplete(nn.Module):
    def __init__(self, vocab_size, d_model=96, n_layers=2, n_heads=4, d_ff=160,
                 max_len=64, pad_id=0):
        super().__init__()
        self.pad_id = pad_id
        self.token_emb = nn.Embedding(vocab_size, d_model, padding_idx=pad_id)
        self.pos = _SinusoidalPositionalEncoding(d_model, max_len)
        layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=n_heads,
                                           dim_feedforward=d_ff, dropout=0.0,
                                           batch_first=True)
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.ln = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, 1)
        self._causal_mask = None

    def _get_causal_mask(self, seq_len: int, device):
        if self._causal_mask is None or self._causal_mask.size(0) < seq_len:
            # boolean mask: True = position masked out (above diagonal)
            self._causal_mask = torch.triu(
                torch.ones(seq_len, seq_len, dtype=torch.bool), diagonal=1)
        return self._causal_mask[:seq_len, :seq_len].to(device)

    def forward(self, ids):
        x = self.pos(self.token_emb(ids))
        pad_mask = ids == self.pad_id
        t = ids.size(1)
        x = self.encoder(x, mask=self._get_causal_mask(t, ids.device),
                         src_key_padding_mask=pad_mask)
        x = self.ln(x)
        lengths = (~pad_mask).sum(dim=1).clamp(min=1) - 1
        last = x[torch.arange(x.size(0), device=x.device), lengths]
        return self.head(last).squeeze(-1)


class CompletenessPredictor:
    def __init__(self, model_dir: str, device: str = "cpu", threshold: float = 0.5):
        with open(os.path.join(model_dir, "config.json")) as f:
            cfg = json.load(f)
        with open(os.path.join(model_dir, "tokenizer.json")) as f:
            tok = json.load(f)
        self.vocab = tok["vocab"]
        self.pad_id = tok["vocab"][tok["pad_token"]]
        self.unk_id = tok["vocab"][tok["unk_token"]]
        self.max_len = cfg["max_len"]
        self.threshold = threshold
        self.device = torch.device(device)
        self.model = _PocketVoiceComplete(
            vocab_size=cfg["vocab_size"], d_model=cfg["d_model"],
            n_layers=cfg["n_layers"], n_heads=cfg["n_heads"],
            d_ff=cfg["d_ff"], max_len=cfg["max_len"], pad_id=self.pad_id)
        st_path = os.path.join(model_dir, "model.safetensors")
        if os.path.exists(st_path):
            from safetensors.torch import load_file
            state = load_file(st_path, device=str(self.device))
        else:
            state = torch.load(os.path.join(model_dir, "pytorch_model.bin"),
                               map_location=self.device, weights_only=True)
        self.model.load_state_dict(state)
        self.model.to(self.device).eval()

    def _encode(self, text: str):
        ids = [self.vocab.get(ch, self.unk_id) for ch in text[:self.max_len]]
        ids += [self.pad_id] * (self.max_len - len(ids))
        return torch.tensor([ids], dtype=torch.long, device=self.device)

    @torch.no_grad()
    def predict(self, text: str) -> dict:
        """Returns {'complete': bool, 'score': float} with score = P(complete)."""
        logits = self.model(self._encode(text if text else " "))
        score = float(torch.sigmoid(logits)[0])
        return {"complete": score >= self.threshold, "score": score}

    @torch.no_grad()
    def predict_many(self, texts) -> list:
        return [self.predict(t) for t in texts]


if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else "."
    p = CompletenessPredictor(d)
    for t in ["turn on the kitchen", "turn on the kitchen lights",
              "set a timer for", "set a timer for five minutes",
              "um", "what time is my meeting tomorrow"]:
        print(f"{t!r:45} -> {p.predict(t)}")
