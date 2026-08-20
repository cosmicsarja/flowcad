from core.groq_client import call_groq
try:
    res = call_groq(
        system="You are an AI",
        user="Return {'status': 'ok'}",
        max_tokens=100
    )
    print("Success:", res)
except Exception as e:
    print("Error:", e)
