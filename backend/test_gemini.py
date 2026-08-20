import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from google import genai
key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=key)
try:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Hello"
    )
    print("gemini-2.5-flash success:", response.text)
except Exception as e:
    print("gemini-2.5-flash Error:", e)

try:
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents="Hello"
    )
    print("models/gemini-2.5-flash success:", response.text)
except Exception as e:
    print("models/gemini-2.5-flash Error:", e)

