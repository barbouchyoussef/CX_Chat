import requests

try:
    resp = requests.get("http://127.0.0.1:8000/api/v1/assessments/10/next-question")
    print(resp.status_code)
    print(resp.text)
except Exception as e:
    print("Error:", e)
