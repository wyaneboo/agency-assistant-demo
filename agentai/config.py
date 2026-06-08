from __future__ import annotations

import os

from dotenv import load_dotenv


load_dotenv()
os.environ.setdefault("LANGCHAIN_CALLBACKS_BACKGROUND", "false")

DEFAULT_MODEL = "gemma-4-31b-it"
