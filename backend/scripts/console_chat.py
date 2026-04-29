import os

import httpx
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    base_url = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

    # Welcome endpoint so the frontend/console shares the same copy.
    try:
        with httpx.Client(timeout=10.0) as client:
            w = client.get(f"{base_url}/api/v1/client/welcome")
            if w.status_code == 200:
                print(f"Assistant: {w.json().get('message')}")
            else:
                print("Assistant: Welcome. What is your company name?")
    except Exception:
        print("Assistant: Welcome. What is your company name?")

    company_name = input("Client: ").strip()
    if not company_name:
        print("Empty company name, stopping.")
        return

    with httpx.Client(timeout=30.0) as client:
        # Turn 1: start
        turn = client.post(f"{base_url}/api/v1/client/turn", json={"message": company_name})
        turn.raise_for_status()
        data = turn.json()

        if data.get("status") == "needs_profile":
            print(f"Assistant: {data.get('assistant_message')}")
            print("Available sectors (code -> label):")
            for o in data.get("sectors", []):
                print(f"  {o.get('code')} -> {o.get('label')}")
            print("Available company sizes (code -> label):")
            for o in data.get("company_sizes", []):
                print(f"  {o.get('code')} -> {o.get('label')}")
            print("")
            sector_code = input("Client (sector code): ").strip()
            size_code = input("Client (company size code): ").strip()
            turn = client.post(
                f"{base_url}/api/v1/client/turn",
                json={"message": company_name, "sector_code": sector_code, "company_size_code": size_code},
            )
            turn.raise_for_status()
            data = turn.json()

        assessment_id = data.get("assessment_id")
        if not assessment_id:
            print("Assistant: Failed to start assessment.")
            return

        assistant_message = data.get("assistant_message") or ""
        if assistant_message:
            axis0 = data.get("axis")
            if axis0:
                print(f"Assistant [{axis0}]: {assistant_message}")
            else:
                print(f"Assistant: {assistant_message}")
            print("")

        while True:
            answer = input("Client: ").strip()
            if not answer:
                print("Empty answer, stopping.")
                break

            tr = client.post(
                f"{base_url}/api/v1/client/turn",
                json={"assessment_id": assessment_id, "message": answer},
            )
            tr.raise_for_status()
            out = tr.json()

            if out.get("status") != "in_progress":
                print(f"Assistant: {out.get('assistant_message') or 'Assessment completed.'}")
                break

            axis = out.get("axis")
            question = out.get("assistant_message") or ""
            print(f"Assistant [{axis}]: {question}")
            print("")


if __name__ == "__main__":
    main()
