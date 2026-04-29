import random

def generate_question(axis, missing, history, sector):
    return f"[{axis}] Can you explain how you handle {random.choice(missing)}?"

def detect_coverage(answer, criteria):
    covered = []
    for c in criteria:
        if any(word in answer.lower() for word in c["label"].lower().split()):
            covered.append(c["id"])
    return {"covered": covered, "confidence": 0.7}