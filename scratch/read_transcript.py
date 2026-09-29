import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = r"C:\Users\AYAN\.gemini\antigravity-ide\brain\3b33696b-a143-425c-9602-74f533e8c435\.system_generated\logs\transcript.jsonl"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
    for line in lines[-35:]:
        data = json.loads(line)
        st = data.get("step_index")
        tp = data.get("type")
        if tp == "PLANNER_RESPONSE":
            print(f"[{st}] MODEL:", (data.get("content") or "")[:200])
            for tc in data.get("tool_calls", []):
                print(f"   TOOL: {tc.get('name')} {list(tc.get('args', {}).keys())} -> {str(tc.get('args'))[:150]}")
        elif tp == "RUN_COMMAND":
            print(f"[{st}] CMD RES: {str(data.get('content'))[:200].replace(chr(10), ' ')}")
        elif tp == "SYSTEM_MESSAGE":
            print(f"[{st}] SYS: {str(data.get('content'))[:200].replace(chr(10), ' ')}")
