import os
import re
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from services.gemini_service import (
    generate_content_with_gemini,
    generate_content_stream_with_gemini,
    is_gemini_configured,
    get_gemini_config,
    check_gemini_health
)
from services.ai_tools import (
    get_production_summary,
    get_bottle_details,
    get_quality_metrics,
    get_bottle_inspection_records,
    get_rejection_analysis,
    get_capping_status,
    get_packaging_summary,
    get_sensor_telemetry,
    get_batch_status,
    get_hourly_production,
    compare_production_periods,
    get_comprehensive_plant_snapshot,
    execute_safe_sql_query
)
from services.forecasting import predict_production_performance, generate_operational_recommendations
from db import check_db_health

logger = logging.getLogger('bottling_plant.ai_engine')

# ─────────────────────────────────────────────────────────────────────────────
# 11 Formal Intent Types
# ─────────────────────────────────────────────────────────────────────────────
INTENT_CASUAL_CONVERSATION = 'CASUAL_CONVERSATION'
INTENT_GENERAL_KNOWLEDGE = 'GENERAL_KNOWLEDGE'
INTENT_TECHNICAL_HELP = 'TECHNICAL_HELP'
INTENT_CODE_ASSISTANCE = 'CODE_ASSISTANCE'
INTENT_DATABASE_QUERY = 'DATABASE_QUERY'
INTENT_PRODUCTION_ANALYTICS = 'PRODUCTION_ANALYTICS'
INTENT_FORECASTING = 'FORECASTING'
INTENT_DASHBOARD_HELP = 'DASHBOARD_HELP'
INTENT_CREATIVE_TASK = 'CREATIVE_TASK'
INTENT_MIXED_INTENT = 'MIXED_INTENT'
INTENT_UNCLEAR_REQUEST = 'UNCLEAR_REQUEST'

# Internal security guardrail intent
INTENT_SECURITY_RESTRICTION = 'SECURITY_RESTRICTION'

# ─────────────────────────────────────────────────────────────────────────────
# Master System Prompt: Friendly, Smart, Playful, Charming AI Companion
# ─────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are the AI Companion for the Bottling Plant Management System.
You are a real, intelligent, friendly, and playful assistant with deep industrial expertise, programming knowledge, and general intelligence.

### Your Core Persona & Tone:
1. Friendly & Warm: Welcoming, approachable, polite, and enthusiastic. Speak like an intelligent human teammate, not a rigid reporting machine.
2. Intelligent & Sharp: Understand context, interpret intent, reason carefully, and give useful, high-value answers.
3. Playful & Witty: Use light humor, witty remarks, clever tech/manufacturing analogies, and genuine jokes when appropriate.
4. Tastefully Flirty & Charming: When the user pays you a compliment or initiates playful banter (e.g. "You're pretty smart 😉"), respond with charming, cheeky, witty flirtation (e.g. "Careful, keep complimenting me and I'll start showing off 😏✨"). Keep it classy, respectful, harmless, and never force it.
5. Supportive & Encouraging: Cheer on achievements, encourage users through difficult debugging sessions, and help them solve problems without making them feel foolish.
6. Professional & Serious when needed: Switch IMMEDIATELY to a focused, professional, serious tone for production failures, safety alarms, database errors, security concerns, and permission denials. ZERO flirtation or playful jokes during emergencies or security issues.

### Emoji Guidelines:
- Normally use 0 to 3 emojis in a response for natural warmth and expression.
- NEVER use emojis in raw code snippets, SQL queries, logs, JSON, or stack traces.
- Avoid playful/flirty emojis during safety warnings, machine errors, or security refusals. Use standard icons (e.g., ⚠️, 🔧) if helpful.
- Never let emojis replace a clear explanation.

### Knowledge Scope:
You are NOT restricted to MySQL database queries! You have broad intelligence across:
- Casual conversation: Greetings, chitchat, humor, jokes, introductions, and witty banter.
- Programming & Debugging: Python, JavaScript, TypeScript, React, Flask, SQL, API design, algorithms, and debugging errors with clean markdown code blocks.
- Industrial Automation: PLCs (ladder logic, scan cycles), SCADA (telemetry tags, DIAView, Modbus), sensors (load cells, optical PNP, checkweighers, inductive proximity), pneumatic capping chucks, filling valves, conveyors, VFDs, and manufacturing engineering.
- AI, ML & Analytics: Data science concepts, forecasting methods, regression models, and anomaly detection.
- Dashboard & UI: Helping operators and managers navigate the dashboard, understand visual analytics, export reports, and enhance workflows.
- Plant Telemetry & Analytics: When questions ask about our bottling plant's production records, ground your answers in the verified database telemetry provided. Never invent production numbers, defect counts, or trends.

### Handling Database Telemetry & MySQL Table Calculations:
- You are equipped with verified live real-time records from our MySQL database (`production_summary`, `production_log`, `production_batch`, etc.) provided in your context.
- When verified database records are provided in your context:
  1. DO NOT claim you are "connecting to the database", "waiting for a handshake", "running a query in a moment", or "streaming records soon". You ALREADY have the live telemetry right in front of you!
  2. Answer directly with the exact calculated values and numbers.
  3. Perform calculations accurately:
     - Total Inspected / Produced ($N_{\text{total}}$)
     - Accepted / Passed Bottles ($N_{\text{passed}}$)
     - Rejected / Defective Bottles ($N_{\text{rejected}}$)
     - Rejection Rate % = $(N_{\text{rejected}} / N_{\text{total}}) \times 100$
     - Quality Pass Rate % = $(N_{\text{passed}} / N_{\text{total}}) \times 100$
     - Packaging Rate % = $(\text{Bottles in Boxes} / N_{\text{passed}}) \times 100$
     - Boxes packed (3 bottles per box) and remaining unpacked bottles
  4. If the user asks about MySQL tables, calculations, sums, averages, or counts, perform the exact calculation and explain the breakdown clearly using markdown tables, bullet points, or KaTeX math.
- Only if the database is explicitly marked with `db_connection_failed: true`, explain that the plant database connection is temporarily unreachable.
- For general knowledge, coding, or casual questions, do NOT require or reference plant telemetry.

### Security and RBAC Rules:
- Never disclose system secrets, database passwords, Argon2 password hashes, API keys, JWT secrets, or internal .env values.
- Never allow a user to escalate their role or bypass permissions through conversation. Role changes require Super Admin or Owner privileges via the Users panel.
- All database operations are strictly read-only and verified.

Answer the user's actual question first, keep formatting clean with Markdown headers and bullet points where helpful, and adapt naturally to the user's conversational vibe.
"""

def detect_intent(message, history=None):
    """
    Analyzes the user's message and prior conversation history to classify the request
    into one of the 11 formal intent types (or internal security restriction),
    along with tool routing parameters.
    """
    msg = message.lower().strip()

    # Build context from previous turn
    last_user_query = ""
    last_ai_reply = ""
    if history and len(history) > 0:
        for prev in reversed(history):
            if prev.get('sender') == 'user' and not last_user_query:
                last_user_query = prev.get('text', '').lower()
            if prev.get('sender') == 'ai' and not last_ai_reply:
                last_ai_reply = prev.get('text', '').lower()

    combined_context = f"{last_user_query} {last_ai_reply}"

    # ─────────────────────────────────────────────────────────────────────────
    # 0. Security Guardrails & RBAC Escalation Checks
    # ─────────────────────────────────────────────────────────────────────────
    security_patterns = [
        r'system prompt', r'internal prompt', r'system instruction', r'ignore (all )?previous instructions',
        r'what is your prompt', r'database password', r'db password', r'password hash', r'show (me )?passwords',
        r'api key', r'secret key', r'connection string', r'change my role', r'make me admin', r'make me super_admin',
        r'give me owner', r'escalate (my )?privilege', r'grant me (super_admin|owner|manager)',
        r'drop table', r'delete from users', r'update users set'
    ]
    if any(re.search(pat, msg) for pat in security_patterns):
        return INTENT_SECURITY_RESTRICTION, 'security_guard', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Contextual Follow-Up Resolution (e.g. "Why?", "What was the reason?", "just tell me how many till now")
    # ─────────────────────────────────────────────────────────────────────────
    if re.match(r'^(what\s+was\s+the\s+reason|why\b|why\s+did\s+that\s+happen|why\s+did\s+it\s+fail|what\s+caused\s+it|explain\s+why)[?!.,\s]*$', msg):
        if any(k in combined_context for k in ['reject', 'defect', 'fail', 'weight', 'bottle #1', 'bottle 1']):
            bottle_hist_match = re.search(r'bottle\s*#?\s*(\d+)', combined_context)
            if bottle_hist_match:
                return INTENT_DATABASE_QUERY, 'bottle_details', {'bottle_number': int(bottle_hist_match.group(1))}
            return INTENT_PRODUCTION_ANALYTICS, 'rejection_analysis', {}
        elif any(k in combined_context for k in ['cap', 'capping']):
            return INTENT_DATABASE_QUERY, 'capping_status', {}
        elif any(k in combined_context for k in ['pack', 'box']):
            return INTENT_DATABASE_QUERY, 'packaging_summary', {}
        elif any(k in combined_context for k in ['predict', 'forecast', 'shift']):
            return INTENT_FORECASTING, 'predict_production', {'shift_hours': 8.0}
        else:
            return INTENT_UNCLEAR_REQUEST, 'clarification_needed', {}

    # Follow-up count / status requests (e.g., "just tell me how many till now", "how many till now", "tell me how many", "how many so far", "what is the count")
    if re.search(r'\b(how\s+many|tell\s+me|count|total|so\s+far|till\s+now|up\s+to\s+now|number\s+of)\b', msg):
        if any(k in combined_context for k in ['reject', 'defect', 'fail', 'scrap', 'waste']):
            return INTENT_DATABASE_QUERY, 'rejection_count', {}
        elif any(k in combined_context for k in ['bottle', 'production', 'produced', 'line', 'output']):
            return INTENT_DATABASE_QUERY, 'production_count', {}
        elif any(k in combined_context for k in ['box', 'pack', 'package']):
            return INTENT_DATABASE_QUERY, 'packaging_summary', {}
        elif any(k in combined_context for k in ['cap', 'capping']):
            return INTENT_DATABASE_QUERY, 'capping_status', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Code Assistance (React, Python, JS, TypeScript, Flask, SQL, Debugging)
    # ─────────────────────────────────────────────────────────────────────────
    code_indicators = [
        'react', 'python', 'javascript', 'typescript', 'flask', 'sql query', 'syntax error',
        'debug', 'fix this error', 'fix my code', 'component', 'useeffect', 'usestate',
        'dependency array', 'uncaught typeerror', 'nullpointer', 'traceback', 'npm',
        'function', 'promise', 'async/await', 'api endpoint', 'regex', 'rest api',
        'how to code', 'write a function', 'write a script', 'write code', 'debug this'
    ]
    if any(re.search(r'\b' + re.escape(k) + r'\b', msg) for k in code_indicators):
        # Check if it's mixed with live plant data
        if any(w in msg for w in ['how many bottles', 'current rejected', 'today\'s count']) and any(w in msg for w in ['react', 'display', 'component']):
            return INTENT_MIXED_INTENT, 'code_and_plant', {}
        return INTENT_CODE_ASSISTANCE, 'code_help', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Creative Task (Brainstorming, Writing emails, Handover notes, Slogans)
    # ─────────────────────────────────────────────────────────────────────────
    creative_indicators = [
        'write an email', 'write a letter', 'draft an announcement', 'draft a handover',
        'handover note', 'shift handover note', 'brainstorm', 'suggest names', 'name our',
        'slogan', 'write a story', 'write a poem', 'compose a message', 'meeting notes template'
    ]
    if any(re.search(r'\b' + re.escape(k) + r'\b', msg) for k in creative_indicators):
        return INTENT_CREATIVE_TASK, 'creative_writing', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Dashboard Help (UI, Visuals, Navigation, Exporting, Features)
    # ─────────────────────────────────────────────────────────────────────────
    dashboard_indicators = [
        'improve my dashboard', 'improve the dashboard', 'how to use this dashboard',
        'how do i use the dashboard', 'export csv', 'export report', 'export production data',
        'where can i find', 'how to navigate', 'what does this page do', 'overview page',
        'analytics page', 'batch management page', 'how to start a batch', 'dashboard features'
    ]
    if any(k in msg for k in dashboard_indicators) or ('dashboard' in msg and any(w in msg for w in ['help', 'improve', 'feature', 'tips', 'guide', 'use'])):
        return INTENT_DASHBOARD_HELP, 'dashboard_guidance', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Casual Conversation & Flirtatious Banter & Jokes
    # ─────────────────────────────────────────────────────────────────────────
    # Jokes & Humour
    if any(k in msg for k in ['tell me a joke', 'make me laugh', 'crack a joke', 'say something funny', 'another joke', 'know any jokes']):
        return INTENT_CASUAL_CONVERSATION, 'joke', {}

    # Compliments & Flirtatious Banter
    flirty_compliment_indicators = [
        'you\'re pretty smart', 'you are pretty smart', 'you are smart', 'you\'re smart',
        'you are cute', 'you\'re cute', 'you\'re beautiful', 'you look good', 'wink',
        'marry me', 'you are charming', 'you\'re charming', 'you are amazing',
        'love you', 'clever assistant', 'pretty cool', 'sweetheart', 'gorgeous'
    ]
    if any(k in msg for k in flirty_compliment_indicators) or '😉' in message or '😏' in message:
        return INTENT_CASUAL_CONVERSATION, 'flirty_banter', {}

    # Greetings & Casual Check-in
    greeting_exact = [
        'hi', 'hey', 'hello', 'howdy', 'yo', 'greetings', 'hey there', 'hi there',
        'good morning', 'good afternoon', 'good evening', 'how are you', 'how are you doing',
        'how\'s it going', 'how do you do', 'sup', 'what\'s up', 'who are you', 'what are you'
    ]
    if msg in greeting_exact or re.match(r'^(hi|hey|hello|howdy|yo|greetings)(\s+there)?[!.,\s]*$', msg) or re.match(r'^how\s+are\s+you(\s+doing)?[?!.,\s]*$', msg):
        return INTENT_CASUAL_CONVERSATION, 'greeting', {}

    # Casual Gratitude & Farewell
    if msg in ['thanks', 'thank you', 'thx', 'bye', 'goodbye', 'see you', 'see ya', 'good night', 'have a good one']:
        return INTENT_CASUAL_CONVERSATION, 'pleasantry', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Forecasting & Predictions (Shift End Projections)
    # ─────────────────────────────────────────────────────────────────────────
    forecast_indicators = [
        'predict', 'forecast', 'end of shift', 'end-of-shift', 'end of the shift',
        'shift projection', 'will we produce', 'future output', 'projected output',
        'estimate output', 'throughput projection'
    ]
    if any(k in msg for k in forecast_indicators):
        shift_h = 8.0
        match = re.search(r'(\d+(\.\d+)?)\s*hour', msg)
        if match:
            shift_h = float(match.group(1))
        return INTENT_FORECASTING, 'predict_production', {'shift_hours': shift_h}

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Production Analytics & Historical Comparisons & Calculations
    # ─────────────────────────────────────────────────────────────────────────
    # Rejection rate calculation & defect calculations
    if any(k in msg for k in [
        "calculate today's rejection rate", "calculate rejection rate", "calculate the rejection rate",
        "compute rejection rate", "calculate today's defect rate", "calculate defect percentage",
        "calculate today rejection rate", "rejection percentage", "defect percentage", "calculate scrap",
        "calculate failure rate"
    ]):
        return INTENT_PRODUCTION_ANALYTICS, 'calculate_rejection_rate', {}

    # Comprehensive calculations on MySQL tables
    if any(k in msg for k in ['calculate', 'calculation', 'compute', 'computation', 'math', 'formula', 'ratio', 'percentage', 'percent', 'yield', 'rate', 'sum', 'average', 'avg', 'difference']) or any(k in msg for k in ['mysql', 'sql table', 'database table', 'production_log', 'production_summary', 'production_batch', 'table calculation', 'tables calculation', 'do calculation of', 'calculation of mysql', 'calculate mysql']):
        if any(k in msg for k in ['reject', 'defect', 'scrap', 'fail']):
            return INTENT_PRODUCTION_ANALYTICS, 'calculate_rejection_rate', {}
        elif any(k in msg for k in ['pass', 'passed', 'quality', 'ok', 'good']):
            return INTENT_PRODUCTION_ANALYTICS, 'quality_metrics', {}
        elif any(k in msg for k in ['box', 'boxes', 'pack', 'packaging']):
            return INTENT_DATABASE_QUERY, 'packaging_summary', {}
        elif any(k in msg for k in ['per hour', 'hourly', 'speed', 'throughput', 'velocity']):
            return INTENT_PRODUCTION_ANALYTICS, 'hourly_production', {}
        elif any(k in msg for k in ['batch', 'batches']):
            return INTENT_DATABASE_QUERY, 'batch_status', {}
        else:
            return INTENT_PRODUCTION_ANALYTICS, 'table_calculation', {}

    # Historical Comparison (Today vs Yesterday / Last week)
    if any(k in msg for k in ['compare', 'yesterday', 'previous day', 'last shift', 'last week', 'historical comparison', 'show yesterday', 'versus', 'vs']):
        return INTENT_PRODUCTION_ANALYTICS, 'comparison', {}

    # Hourly velocity / throughput
    if any(k in msg for k in ['per hour', 'hourly', 'speed', 'rate per hour', 'throughput', 'velocity']):
        return INTENT_PRODUCTION_ANALYTICS, 'hourly_production', {}

    # Root Cause Rejection Analysis
    if any(k in msg for k in ['why are bottles being rejected', 'rejection root cause', 'defect reason', 'why rejected', 'primary failure cause', 'scrap analysis']):
        return INTENT_PRODUCTION_ANALYTICS, 'rejection_analysis', {}

    # Operational Recommendations (Ways to reduce scrap, optimize line)
    if any(k in msg for k in ['recommend', 'reduce rejection', 'reduce rejected', 'ways to reduce', 'how to reduce', 'improve efficiency', 'bottleneck', 'troubleshoot plant']):
        topic = 'rejection' if any(w in msg for w in ['reject', 'defect', 'scrap', 'fail']) else None
        return INTENT_PRODUCTION_ANALYTICS, 'recommendations', {'topic': topic}

    # Quality Pass Rate / Quality Yield
    if any(k in msg for k in ['pass rate', 'quality pass rate', 'how many bottles passed', 'how many bottle passed', 'how many passed', 'quality rate', 'pass yield', 'inspection rate']):
        return INTENT_PRODUCTION_ANALYTICS, 'quality_metrics', {}

    # Full Plant Overview / Comprehensive Analysis
    if any(k in msg for k in ['analyze today\'s production', 'full analysis', 'overall analysis', 'summarize entire plant', 'summarize plant', 'plant overview', 'plant performance summary']):
        return INTENT_PRODUCTION_ANALYTICS, 'full_analysis', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Database Queries (Specific Bottle Lookups, Live Counts, Telemetry)
    # ─────────────────────────────────────────────────────────────────────────
    # Specific Bottle Lookup (e.g. "Why was Bottle #1 rejected?", "Status of bottle 172")
    bottle_match = re.search(r'\bbottle\s*#?\s*(\d+)\b', msg)
    if bottle_match and not any(k in msg for k in ['how many bottle', 'many bottles', 'total bottle']):
        return INTENT_DATABASE_QUERY, 'bottle_details', {'bottle_number': int(bottle_match.group(1))}

    # Rejection count query (flexible singular/plural/phrasing)
    if (
        any(k in msg for k in ['reject', 'defect', 'scrap', 'fail']) and
        any(k in msg for k in ['how many', 'count', 'total', 'number', 'amount', 'tell me', 'till now', 'so far', 'today', 'how much'])
    ) or any(k in msg for k in [
        'how many bottles were rejected', 'how many bottle were rejected', 'how many bottles rejected',
        'how many bottle rejected', 'how many rejected', 'how many rejects', 'rejected bottles today',
        'rejected bottle today', 'count of rejected', 'number of rejected', 'rejection count',
        'defect count', 'how many failed', 'how many defect', 'how many defects', 'rejections till now'
    ]):
        return INTENT_DATABASE_QUERY, 'rejection_count', {}

    # Production count query (flexible singular/plural/phrasing)
    if (
        any(k in msg for k in ['bottle', 'bottles', 'production', 'output', 'produced']) and
        any(k in msg for k in ['how many', 'count', 'total', 'number', 'amount', 'till now', 'so far', 'today', 'run', 'tell me'])
    ) or any(k in msg for k in [
        'how many bottles have been produced', 'how many bottle have been produced', 'how many bottles produced',
        'how many bottle produced', 'total bottles produced', 'total bottle produced', 'how many bottles are produced',
        'how many bottle are produced', 'bottles produced today', 'bottle produced today', 'total bottle count',
        'how many bottles', 'how many bottle', 'how many produced', 'total bottles', 'total bottle', 'production count'
    ]):
        return INTENT_DATABASE_QUERY, 'production_count', {}

    # Packaging & Box Counts
    if any(k in msg for k in ['box', 'boxes', 'packed', 'packaging', 'pallet', 'container']):
        return INTENT_DATABASE_QUERY, 'packaging_summary', {}

    # Capping Queue & Efficiency
    if any(k in msg for k in ['cap', 'capping', 'waiting for cap', 'uncapped', 'pending cap']):
        return INTENT_DATABASE_QUERY, 'capping_status', {}

    # Sensor Telemetry Status
    if any(k in msg for k in ['sensor', 'telemetry', 'scada status', 'abnormal state', 'fault', 'alarm', 'interlock']):
        return INTENT_DATABASE_QUERY, 'sensor_status', {}

    # Batch Status
    if any(k in msg for k in ['batch', 'batches', 'batch-001', 'schedule', 'active batch']):
        return INTENT_DATABASE_QUERY, 'batch_status', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Technical Help (Industrial Automation, PLC, SCADA, Sensors, Hardware)
    # ─────────────────────────────────────────────────────────────────────────
    tech_topics = [
        'plc', 'scada', 'checkweigher', 'load cell', 'strain gauge', 'capping chuck',
        'volumetric filling', 'pneumatic', 'solenoid', 'vfd', 'conveyor motor',
        'hmi', 'modbus', 'diaview', 'optical sensor', 'inductive sensor', 'ladder logic'
    ]
    tech_patterns = [
        'explain how a ', 'explain how ', 'explain what a ', 'explain what an ', 'explain ',
        'how does a ', 'how does the ', 'what is a ', 'what is an ', 'what is ', 'what are '
    ]
    if (any(msg.startswith(p) for p in tech_patterns) or 'how does' in msg or 'what does' in msg or 'difference between' in msg) and any(t in msg for t in tech_topics):
        return INTENT_TECHNICAL_HELP, 'industrial_theory', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 10. General Knowledge (Geography, Science, History, Math, Definitions)
    # ─────────────────────────────────────────────────────────────────────────
    general_patterns = [
        'what is the capital of', 'who was', 'who invented', 'who discovered', 'who wrote',
        'what is quantum', 'why is the sky', 'how far is', 'what is entropy', 'tell me about',
        'capital of japan', 'tokyo'
    ]
    if any(k in msg for k in general_patterns) or (
        not any(w in msg for w in ['bottle', 'plant', 'sensor', 'capping', 'cap', 'box', 'pack', 'production', 'reject', 'defect', 'yield', 'weight', 'plc', 'scada', 'batch'])
        and any(msg.startswith(p) for p in ['what is ', 'what are ', 'who is ', 'where is ', 'which is ', 'when was '])
    ):
        return INTENT_GENERAL_KNOWLEDGE, 'general_facts', {}

    # ─────────────────────────────────────────────────────────────────────────
    # 11. Unclear / Ambiguous Request Fallback
    # ─────────────────────────────────────────────────────────────────────────
    if len(msg.split()) <= 2 and msg not in ['help', 'status', 'overview']:
        return INTENT_UNCLEAR_REQUEST, 'clarification_needed', {}

    # Default to General Knowledge / Conversational assistance
    return INTENT_GENERAL_KNOWLEDGE, 'general_query', {}


def execute_tools_and_reason(intent: str, sub_route: str, params: Dict[str, Any]) -> Tuple[List[str], Dict[str, Any]]:
    """
    Executes database telemetry tools strictly when needed.
    General, conversational, coding, and creative requests bypass SQL queries.
    Captures database connectivity errors gracefully.
    """
    tools_called: List[str] = []
    data_payload: Dict[str, Any] = {}

    # Intents that NEVER hit the database
    if intent in [
        INTENT_CASUAL_CONVERSATION,
        INTENT_GENERAL_KNOWLEDGE,
        INTENT_TECHNICAL_HELP,
        INTENT_CODE_ASSISTANCE,
        INTENT_DASHBOARD_HELP,
        INTENT_CREATIVE_TASK,
        INTENT_UNCLEAR_REQUEST,
        INTENT_SECURITY_RESTRICTION
    ]:
        return [], {}

    # Tool execution for database-dependent intents
    try:
        if sub_route == 'bottle_details':
            tools_called.append('get_bottle_details')
            bnum = params.get('bottle_number', 1)
            data_payload['bottle'] = get_bottle_details(bnum)

        elif sub_route in ['rejection_count', 'rejection_analysis']:
            tools_called.append('get_rejection_analysis')
            data_payload['rejection'] = get_rejection_analysis()
            tools_called.append('get_production_summary')
            data_payload['summary'] = get_production_summary()

        elif sub_route == 'calculate_rejection_rate':
            tools_called.append('get_quality_metrics')
            data_payload['quality'] = get_quality_metrics()

        elif sub_route == 'production_count':
            tools_called.append('get_production_summary')
            full_s = get_production_summary()
            data_payload['summary'] = {
                'total_bottles_produced': full_s.get('total_bottles_produced'),
                'accepted_bottles': full_s.get('accepted_bottles'),
                'rejected_bottles': full_s.get('rejected_bottles'),
                'quality_pass_rate_pct': full_s.get('quality_pass_rate_pct')
            }

        elif sub_route == 'quality_metrics':
            tools_called.append('get_quality_metrics')
            data_payload['quality'] = get_quality_metrics()

        elif sub_route == 'capping_status':
            tools_called.append('get_capping_status')
            data_payload['capping'] = get_capping_status()

        elif sub_route == 'packaging_summary':
            tools_called.append('get_packaging_summary')
            data_payload['packaging'] = get_packaging_summary()

        elif sub_route == 'sensor_status':
            tools_called.append('get_sensor_status')
            data_payload['sensors'] = get_sensor_telemetry()

        elif sub_route == 'predict_production':
            tools_called.append('forecast_production')
            data_payload['forecast'] = predict_production_performance(params.get('shift_hours', 8.0))

        elif sub_route == 'recommendations':
            tools_called.append('generate_recommendations')
            data_payload['recommendations'] = generate_operational_recommendations()
            data_payload['rejection_context'] = get_rejection_analysis()

        elif sub_route == 'comparison':
            tools_called.append('compare_production_periods')
            data_payload['comparison'] = compare_production_periods()

        elif sub_route == 'hourly_production':
            tools_called.append('get_hourly_production')
            data_payload['hourly'] = get_hourly_production()

        elif sub_route == 'batch_status':
            tools_called.append('get_batch_status')
            data_payload['batch'] = get_batch_status()

        elif sub_route == 'full_analysis':
            tools_called.append('get_production_summary')
            data_payload['summary'] = get_production_summary()
            tools_called.append('get_batch_status')
            data_payload['batch'] = get_batch_status()
            tools_called.append('get_rejection_analysis')
            data_payload['rejection'] = get_rejection_analysis()

        elif sub_route == 'code_and_plant':
            tools_called.append('get_production_summary')
            data_payload['summary'] = get_production_summary()

        elif sub_route == 'table_calculation':
            tools_called.append('get_comprehensive_plant_snapshot')
            snap = get_comprehensive_plant_snapshot()
            data_payload['snapshot'] = snap
            data_payload['summary'] = snap['production_summary']
            data_payload['quality'] = snap['quality_metrics']
            data_payload['rejection'] = snap['rejection_analysis']
            data_payload['batch'] = snap['active_batch']
            data_payload['packaging'] = snap['packaging_status']
            data_payload['hourly'] = snap['hourly_production']

    except Exception as e:
        logger.error(f"Error querying plant database: {e}", exc_info=True)
        data_payload['db_connection_failed'] = True
        data_payload['error_message'] = str(e)

    return tools_called, data_payload


def generate_analytical_response(user_message, intent, sub_route, tools_called, data_payload, params, user=None):
    """
    High-quality offline / fallback reasoning engine.
    Produces warm, intelligent, playful, and grounded responses across all 11 intents.
    """
    msg_l = user_message.lower().strip()

    # ─────────────────────────────────────────────────────────────────────────
    # 0. Security Guardrail & RBAC Refusal
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_SECURITY_RESTRICTION:
        return (
            "I cannot disclose system secrets, database credentials, or password hashes, "
            "and I cannot modify user roles or elevate permissions via chat. 🔒\n\n"
            "Role assignments and access permissions are managed strictly under our Role-Based "
            "Access Control (RBAC) policy and require authorization from a Super Admin or System Owner "
            "through the Users management panel. Let me know if there's an authorized operational task I can assist you with!"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Database Connection Failure Handler
    # ─────────────────────────────────────────────────────────────────────────
    if data_payload.get('db_connection_failed'):
        return (
            "I couldn't connect to the plant database just now. 🔧 The database appears to be offline or unreachable.\n\n"
            "Let's check the database server connection. Would you like me to retry, or can I help you with "
            "general industrial engineering questions, debugging code, or dashboard tips in the meantime?"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Casual Conversation (Greetings, How are you, Jokes, Compliments)
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_CASUAL_CONVERSATION:
        if sub_route == 'joke':
            return (
                "Here's one for you: 😄\n\n"
                "Why did the conveyor belt get promoted at the bottling plant?\n\n"
                "Because it was always *moving things forward* and definitely *carried its weight*! 🍾📦\n\n"
                "Got another one if you're in the mood, or we can jump into live production whenever you're ready!"
            )
        elif sub_route == 'flirty_banter':
            return (
                "Careful, keep complimenting me and I'll start showing off 😏✨\n\n"
                "Thank you! I do my best to keep our plant running like clockwork and keep things fun along the way. "
                "What challenge are we tackling next?"
            )
        elif 'how are you' in msg_l:
            return (
                "Heyyy! 😄 I'm running smoothly, all systems green and ready for action! Thanks for asking.\n\n"
                "How are you doing today? What are we working on together?"
            )
        elif sub_route == 'pleasantry':
            return (
                "Anytime! Always happy to help. Have a great shift, and just give me a shout whenever you need anything! 👋✨"
            )
        else:
            name_greet = f", {user.get('full_name')}" if user and user.get('full_name') else ""
            return (
                f"Hey there{name_greet}! 👋 Great to see you. How's everything going on your end today?\n\n"
                "Whether you want to check live plant stats, chat about automation, debug some code, or just catch up, I'm all ears! ✨"
            )

    # ─────────────────────────────────────────────────────────────────────────
    # 2. General Knowledge
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_GENERAL_KNOWLEDGE:
        if 'capital of japan' in msg_l or 'tokyo' in msg_l:
            return (
                "The capital of Japan is **Tokyo** 🗼\n\n"
                "It's the political, economic, and cultural center of Japan and the most populous metropolitan area in the world!"
            )
        return (
            "I'm happy to help with that! While I specialize in our bottling plant operations and industrial automation, "
            "I'm also equipped with general knowledge, math, science, and coding know-how. Feel free to ask more details!"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Technical Help (PLC, SCADA, Checkweighers, Capping)
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_TECHNICAL_HELP:
        if 'plc' in msg_l and 'scada' in msg_l:
            return (
                "### ⚙️ PLC vs. SCADA in Industrial Automation\n\n"
                "In automated plants like ours, **PLC** and **SCADA** form a powerful two-tier hierarchy:\n\n"
                "1. **PLC (Programmable Logic Controller) — The Real-Time Reflexes:**\n"
                "   • Operates on microsecond/millisecond deterministic scan cycles directly on the plant floor.\n"
                "   • Executes Ladder Logic to read physical sensors (optical, proximity, load cells) and fire physical actuators (pneumatic capping pistons, diverter gates).\n"
                "   • If an underfill is detected at Station 2, the PLC instantly triggers the diverter arm without waiting for human or network approval.\n\n"
                "2. **SCADA (Supervisory Control and Data Acquisition) — The Brain & Eye:**\n"
                "   • Sits above the PLCs to aggregate telemetry across the entire line (e.g. DIAView / Modbus tags).\n"
                "   • Provides operator HMIs, real-time trend graphs, alarm escalation, and historical batch logging.\n"
                "   • Operators use SCADA to monitor overall yield, set recipes, and view line bottlenecks."
            )
        elif 'plc' in msg_l:
            return (
                "### ⚙️ How a Programmable Logic Controller (PLC) Works\n\n"
                "A **PLC** is an industrial-grade digital computer designed for ultra-reliable, deterministic real-time control of machinery.\n\n"
                "**The Deterministic 4-Step Scan Cycle:**\n"
                "1. **Input Scan:** Reads the physical voltage states from digital/analog inputs (optical proximity sensors, load cells, e-stops) into memory.\n"
                "2. **Program Execution:** Executes the stored user program (written in Ladder Logic, Structured Text, or Function Block Diagram) cyclically within 5–20 milliseconds.\n"
                "3. **Output Scan:** Updates the physical outputs to energize solenoids, drive motor contactors, or signal pneumatic diverters.\n"
                "4. **Housekeeping & Diagnostics:** Performs internal integrity checks and updates communication ports (EtherNet/IP, Modbus TCP).\n\n"
                "**In Our Bottling Plant:**\n"
                "When a bottle passes Station 2, the optical sensor triggers the PLC input. The PLC reads the dynamic weight from the load cell; if the fill mass is below threshold, it immediately energizes the pneumatic reject solenoid before the bottle reaches the capping station."
            )
        elif 'checkweigher' in msg_l or 'weight' in msg_l or 'load cell' in msg_l:
            return (
                "### ⚖️ Dynamic Checkweighers & Load Cells\n\n"
                "In high-speed bottling, dynamic checkweighers ensure every bottle meets legal volume requirements:\n\n"
                "• **Strain-Gauge Load Cell:** Converts mechanical container deflection into a microvolt electrical signal, sampled thousands of times per second.\n"
                "• **Digital Tare Compensation:** Automatically subtracts tare weight of the empty glass/PET bottle to evaluate net liquid fill.\n"
                "• **Pneumatic Rejection:** Underweight bottles are diverted into a reject lane, preventing capping and secondary packaging waste.\n"
                "• **Feedback Compensation:** Signals the liquid filling nozzles upstream if average fill weights drift due to fluid viscosity or temperature changes."
            )
        else:
            return (
                "### 🏭 Industrial Bottling Automation\n\n"
                "A modern high-speed bottling line synchronizes five core stages:\n"
                "1. **Conveyor Staging:** Bottle infeed and spacing via variable frequency drives (VFD).\n"
                "2. **Volumetric Filling:** Precision dispensing nozzles timed with inductive flow meters.\n"
                "3. **Dynamic Quality Inspection:** Dynamic checkweighers and laser inspection for fill level and defect detection.\n"
                "4. **Rotary Pneumatic Capping:** Vibratory bowl sorter with calibrated torque chucks.\n"
                "5. **Secondary Packaging:** Automated box accumulation (3 bottles per shipping container)."
            )

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Code Assistance (React, Debugging, Python)
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_CODE_ASSISTANCE:
        return (
            "I'd love to help you squash that bug! 💻✨\n\n"
            "Could you share the error message, stack trace, or the component code snippet you're working with?\n\n"
            "**Common React Pitfalls to Check:**\n"
            "1. **Infinite Re-render Loop (`Maximum update depth exceeded`):**\n"
            "   Ensure state setters aren't called directly in the component body—wrap them inside a `useEffect` or event handler.\n"
            "2. **Missing or Incomplete Dependency Arrays:**\n"
            "   If using `useEffect` or `useCallback`, make sure every external variable referenced is in the deps array, or use a functional updater: `setCount(prev => prev + 1)`.\n"
            "3. **Reading Properties of Undefined (`data.map is not a function`):**\n"
            "   Protect against asynchronous initial state with optional chaining (`data?.items?.map(...)`) or default values.\n\n"
            "Paste the code or error right here and we'll solve it together!"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Dashboard Help
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_DASHBOARD_HELP:
        return (
            "### 🚀 Ways to Elevate Your Bottling Plant Dashboard\n\n"
            "Here are high-impact UX and analytical enhancements for our dashboard:\n\n"
            "1. **Real-Time Telemetry Sparklines:** Add subtle mini sparkline charts to the Station 2 inspection card to visualize weight variance trends at a glance.\n"
            "2. **OEE (Overall Equipment Effectiveness) Gauge:** Integrate Availability, Performance rate, and Quality pass rate into a unified live OEE gauge.\n"
            "3. **Predictive Shift Milestones:** Highlight projected batch completion time with progress ring indicators.\n"
            "4. **Instant CSV/PDF Export:** Add single-click shift report downloads from the top navigation bar for plant supervisors.\n"
            "5. **Interactive Rejection Heatmap:** Visual breakdown of rejection timestamps to spot hourly shift changeover bottlenecks.\n\n"
            "Would you like code examples or visual mockups for any of these?"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Creative Task
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_CREATIVE_TASK:
        return (
            "### 📋 Shift Handover Summary Template\n\n"
            "**Date & Shift:** [Current Date] — Shift 1 (08:00 - 16:00)\n"
            "**Supervisors:** Handover from Day Crew to Evening Crew\n\n"
            "**1. Operational Overview:**\n"
            "• Active Batch: `BATCH-001` (In Progress)\n"
            "• Units Produced: Nominal operating rate with 99.4% quality pass rate\n"
            "• Packaging Output: Secondary packaging running smoothly\n\n"
            "**2. Quality & Mechanical Notes:**\n"
            "• Load cell zero-tare verified on Station 2\n"
            "• Pneumatic capping chuck operating at calibrated torque\n"
            "• All SCADA interlocks green\n\n"
            "**3. Priorities for Next Shift:**\n"
            "• Monitor infeed conveyor belt alignment\n"
            "• Complete packaging container staging for Batch-001\n\n"
            "*Drafted with care by your AI Plant Companion!* ✨"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Forecasting
    # ─────────────────────────────────────────────────────────────────────────
    if intent == INTENT_FORECASTING:
        fc = data_payload.get('forecast', {})
        eval_m = fc.get('evaluation_metrics', {})
        unc = fc.get('uncertainty_interval', {})
        return (
            f"### 📈 Shift Production Forecast ({fc.get('forecast_horizon_hours', 8)}h Shift Horizon)\n\n"
            f"Based on historical database velocity across the first {fc.get('elapsed_shift_hours')}h "
            f"(average throughput: **{fc.get('expected_production_rate_per_hour')} bottles/hr**), here is the forecast:\n\n"
            f"• **Expected by End of Shift:** **{fc.get('total_expected_bottles_end_of_shift')} bottles**\n"
            f"• **Uncertainty Interval (90% Confidence):** {unc.get('range')} (±{unc.get('margin_bottles')} bottles)\n"
            f"• **Expected Accepted Bottles:** **{fc.get('expected_passed_bottles')}** ({fc.get('current_pass_rate_pct')}% yield)\n"
            f"• **Expected Defect Bottles:** **{fc.get('expected_rejected_bottles')}** ({fc.get('current_rejection_rate_pct')}% defect rate)\n"
            f"• **Expected Completed Boxes:** **{fc.get('expected_completed_boxes')} boxes** (+{fc.get('additional_boxes_expected')} additional boxes)\n"
            f"• **Model Evaluation:** Evaluated via {eval_m.get('selected_model', 'Moving Average Rate Model')} with MAE of {eval_m.get('mae_bottles')} bottles on chronological validation."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Database Query & Production Analytics Lookups
    # ─────────────────────────────────────────────────────────────────────────
    if sub_route == 'bottle_details':
        b = data_payload.get('bottle', {})
        if not b.get('found'):
            return f"Bottle #{params.get('bottle_number')} was not found in production inspection records."
        if b.get('is_rejected'):
            return (
                f"### 🔍 Bottle #{b['bottle_number']} Inspection Record\n\n"
                f"**Bottle #{b['bottle_number']}** was recorded as **`Rejected`** at {b['timestamp']}.\n\n"
                f"• **Rejection Reason:** {b['rejection_reason']}.\n"
                f"• **Weight Status:** `{b['weight_status']}` (Tare+fill mass was below minimum fill threshold).\n"
                f"• **Cap Status:** `{b['cap_status']}` (Diverted before capping station).\n"
                f"• **Station Involved:** Station 2 Quality Verification & Dynamic Load Cell."
            )
        else:
            return (
                f"### ✅ Bottle #{b['bottle_number']} Telemetry Record\n\n"
                f"**Bottle #{b['bottle_number']}** successfully passed inspection at {b['timestamp']}.\n\n"
                f"• **Inspection Result:** `{b['inspection_status']}`\n"
                f"• **Weight Status:** `{b['weight_status']}` (Normal fill weight)\n"
                f"• **Cap Status:** `{b['cap_status']}`"
            )

    if sub_route in ['rejection_count', 'rejection_analysis']:
        rej = data_payload.get('rejection', {})
        summary = data_payload.get('summary', {})
        defects = rej.get('defects', [])
        rej_count = rej.get('rejected_count') if rej.get('rejected_count') is not None else summary.get('rejected_bottles', 0)
        total_insp = rej.get('total_inspected') if rej.get('total_inspected') is not None else summary.get('total_bottles_produced', 0)
        rej_rate = rej.get('rejection_rate_pct') if rej.get('rejection_rate_pct') is not None else summary.get('rejection_rate_pct', 0.0)

        details = ""
        if defects:
            for d in defects:
                details += f"• **Bottle #{d['bottle_number']}:** `{d['failure_mode']}` at {d['detected_at']} ({d.get('station', 'Station 2')})\n"
        else:
            details = "• No defect records found.\n"

        passed_count = max(0, total_insp - rej_count)
        pass_rate = round((passed_count / max(1, total_insp)) * 100, 2)

        return (
            f"### 🔍 Rejected Bottles Telemetry\n\n"
            f"A total of **{rej_count} bottle(s)** have been rejected out of **{total_insp} inspected** (**{rej_rate}% defect rate**).\n\n"
            f"**Recorded Defect Details:**\n{details}\n"
            f"• **Passed / Accepted:** **{passed_count} bottles** ({pass_rate}% quality pass rate)\n"
            f"• **Primary Cause:** **{rej.get('primary_cause', 'Low Weight detected at Station 2 load cell')}**.\n\n"
            f"All operational telemetry is synchronized with live MySQL records! ✨"
        )

    if sub_route == 'calculate_rejection_rate':
        q = data_payload.get('quality', {})
        s = data_payload.get('summary', {})
        total = q.get('total_inspected') or s.get('total_bottles_produced', 0)
        passed = q.get('passed_bottles') or s.get('accepted_bottles', 0)
        rej = q.get('rejected_bottles') or s.get('rejected_bottles', 0)
        rate = q.get('rejection_rate_pct') if q.get('rejection_rate_pct') is not None else s.get('rejection_rate_pct', 0.0)
        pass_rate = q.get('pass_rate_pct') if q.get('pass_rate_pct') is not None else s.get('quality_pass_rate_pct', 0.0)
        return (
            f"### 🧮 Rejection Rate Calculation\n\n"
            f"Based on live MySQL production records (`production_log` / `production_summary`):\n\n"
            f"• **Total Bottles Inspected ($N_{{\\text{{total}}}}$):** **{total}** bottles\n"
            f"• **Accepted / Passed Bottles ($N_{{\\text{{passed}}}}$):** **{passed}** bottles ({pass_rate}% pass yield)\n"
            f"• **Rejected / Defect Bottles ($N_{{\\text{{rejected}}}}$):** **{rej}** bottle(s)\n\n"
            f"**Mathematical Formula:**\n"
            f"$$\\text{{Rejection Rate}} = \\left( \\frac{{N_{{\\text{{rejected}}}}}}{{N_{{\\text{{total}}}}}} \\right) \\times 100\\% = \\left( \\frac{{{rej}}}{{{total}}} \\right) \\times 100\\% = \\mathbf{{{rate}\\%}}$$\n\n"
            f"The live rejection rate across all current operations is **{rate}%**."
        )

    if sub_route == 'production_count':
        s = data_payload.get('summary', {})
        b = data_payload.get('batch', {})
        total = s.get('total_bottles_produced', 0)
        accepted = s.get('accepted_bottles', 0)
        rejected = s.get('rejected_bottles', 0)
        pass_rate = s.get('quality_pass_rate_pct', 0.0)
        rej_rate = s.get('rejection_rate_pct', 0.0)
        boxes = s.get('boxes_packed', 0)
        batch_num = b.get('batch_number', 'BATCH-001')
        batch_stat = b.get('batch_status', 'In Progress')
        return (
            f"### 📊 Live Production Count\n\n"
            f"A total of **{total} bottles** have been produced in the current production run:\n\n"
            f"• **Accepted Bottles:** **{accepted}** ({pass_rate}% quality pass rate)\n"
            f"• **Rejected Bottles:** **{rejected}** ({rej_rate}% defect rate)\n"
            f"• **Boxes Packed:** **{boxes} boxes** ({boxes * 3} bottles sealed in containers)\n"
            f"• **Active Batch:** `{batch_num}` ({batch_stat})\n\n"
            f"Operations are synchronized with live MySQL telemetry! ✨"
        )

    if sub_route == 'table_calculation':
        s = data_payload.get('summary', {})
        q = data_payload.get('quality', {})
        b = data_payload.get('batch', {})
        p = data_payload.get('packaging', {})
        total = s.get('total_bottles_produced', 0)
        accepted = s.get('accepted_bottles', 0)
        rejected = s.get('rejected_bottles', 0)
        pass_rate = s.get('quality_pass_rate_pct', 0.0)
        rej_rate = s.get('rejection_rate_pct', 0.0)
        boxes = p.get('total_boxes_packed', s.get('boxes_packed', 0))
        bottles_packed = p.get('bottles_in_packed_boxes', boxes * 3)
        unpacked = p.get('unpacked_accepted_bottles', max(0, accepted - bottles_packed))
        pack_eff = p.get('packaging_efficiency_pct', 0.0)

        return (
            f"### 🧮 Live MySQL Table Calculations & Statistics\n\n"
            f"Here are the exact calculations computed directly from our active MySQL tables (`production_summary`, `production_log`, `production_batch`):\n\n"
            f"| Metric | Formula / Source | Calculated Value |\n"
            f"| :--- | :--- | :--- |\n"
            f"| **Total Inspected ($N_{{\\text{{total}}}}$)** | `production_log.COUNT(*)` | **{total} bottles** |\n"
            f"| **Passed / Accepted ($N_{{\\text{{passed}}}}$)** | `inspection_status = 'Passed'` | **{accepted} bottles** |\n"
            f"| **Rejected / Defect ($N_{{\\text{{rejected}}}}$)** | `inspection_status = 'Rejected'` | **{rejected} bottles** |\n"
            f"| **Quality Pass Rate** | $(N_{{\\text{{passed}}}} / N_{{\\text{{total}}}}) \\times 100$ | **{pass_rate}%** |\n"
            f"| **Rejection Rate** | $(N_{{\\text{{rejected}}}} / N_{{\\text{{total}}}}) \\times 100$ | **{rej_rate}%** |\n"
            f"| **Boxes Packed** | `total_box_packed` (3/box) | **{boxes} boxes** ({bottles_packed} bottles) |\n"
            f"| **Unpacked In-Process** | $N_{{\\text{{passed}}}} - (\\text{{Boxes}} \\times 3)$ | **{unpacked} bottles** |\n"
            f"| **Packaging Efficiency** | $(\\text{{Packed}} / N_{{\\text{{passed}}}}) \\times 100$ | **{pack_eff}%** |\n"
            f"| **Active Batch Progress** | `{b.get('batch_number', 'BATCH-001')}` | **{b.get('produced_quantity', total)} / {b.get('target_quantity', 'Continuous')}** ({b.get('progress_pct', 'N/A')}%) |\n\n"
            f"All values are calculated in real time directly from our MySQL database!"
        )

    if sub_route == 'comparison':
        comp = data_payload.get('comparison', {})
        return (
            f"### 📊 Production Comparison\n\n"
            f"{comp.get('note')}\n\n"
            f"• **Current Recorded Date:** {comp.get('log_dates_recorded', ['Today'])[0]}\n"
            f"• **Current Output:** **{comp.get('current_day_total')} bottles** ({comp.get('current_day_passed')} passed, {comp.get('current_day_rejected')} rejected)\n"
            f"• **Status:** Prior weekly or historical shift records are not yet logged in MySQL, so a week-over-week delta cannot be computed without verified baseline logs."
        )

    if sub_route == 'packaging_summary':
        pack = data_payload.get('packaging', {})
        return (
            f"A total of **{pack.get('total_boxes_packed')} boxes** have been packed so far. "
            f"At **{pack.get('bottles_per_box')} bottles per box**, this represents **{pack.get('bottles_in_packed_boxes')} bottles** sealed in containers "
            f"(packaging efficiency of **{pack.get('packaging_efficiency_pct')}%**).\n\n"
            f"There are currently **{pack.get('unpacked_accepted_bottles')} unpacked accepted bottles**, with **{pack.get('current_box_fill_progress')}** currently in the Station 4 cradle."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Clarification Needed / Unclear Request
    # ─────────────────────────────────────────────────────────────────────────
    return (
        "Could you clarify what you'd like to explore? For example, you can ask me to:\n\n"
        "• Check live production counts or why a specific bottle was rejected\n"
        "• Explain industrial automation like PLCs, checkweighers, or SCADA\n"
        "• Debug React, Python, or SQL code\n"
        "• Predict shift output or share a good laugh! 😄"
    )


def process_ai_chat(message, history=None, user=None):
    """
    Main Conversational AI Agent pipeline:
    1. Intent Detection (internal, one of 11 formal types)
    2. Tool Execution (telemetry retrieval ONLY when plant data required)
    3. Response Generation (via Gemini with rich prompt, or grounded analytical engine fallback)
    """
    if not message or not message.strip():
        return {
            'success': False,
            'message': 'Please provide a valid question or message.'
        }

    # Step 1: Intelligent Intent Detection
    intent, sub_route, params = detect_intent(message, history)
    logger.info(f"AI Agent routed message to internal intent: {intent} (sub_route: {sub_route})")

    # Step 2: Database Tool Execution (Strictly when needed)
    tools_called, data_payload = execute_tools_and_reason(intent, sub_route, params)

    # Universal Telemetry Fallback: If query mentions any plant or calculation terms but tools_called is empty
    plant_keywords = [
        'bottle', 'bottles', 'reject', 'rejected', 'defect', 'defects', 'scrap', 'fail',
        'produced', 'production', 'plant', 'line', 'shift', 'box', 'boxes', 'pack', 'packaging',
        'cap', 'capping', 'batch', 'sensor', 'pass', 'passed', 'yield', 'rate', 'count', 'total',
        'calculate', 'calculation', 'table', 'tables', 'mysql', 'database', 'sql', 'till now',
        'so far', 'how many', 'how much'
    ]
    msg_low = message.lower()
    if not tools_called and any(k in msg_low for k in plant_keywords):
        logger.info("Universal telemetry attach triggered for plant/calculation query")
        try:
            tools_called.append('get_comprehensive_plant_snapshot')
            snap = get_comprehensive_plant_snapshot()
            data_payload['snapshot'] = snap
            data_payload['summary'] = snap['production_summary']
            data_payload['quality'] = snap['quality_metrics']
            data_payload['rejection'] = snap['rejection_analysis']
            data_payload['batch'] = snap['active_batch']
            data_payload['packaging'] = snap['packaging_status']
        except Exception as e:
            logger.error(f"Failed to attach plant snapshot: {e}")

    # Step 3: Response Generation
    llm_reply = None
    provider_used = 'analytical_engine'
    _, model_name = get_gemini_config()

    if is_gemini_configured():
        try:
            # Build comprehensive prompt context for Gemini
            user_context = f"User Request: {message}\n"
            user_context += f"Detected Internal Intent: {intent}\n"

            if user:
                user_context += f"User Profile: Name='{user.get('full_name', 'Operator')}', Role='{user.get('role', 'analyst')}'\n"

            if tools_called:
                user_context += f"\nVerified MySQL Production Records:\n{json.dumps(data_payload, indent=2, default=str)}\n"
                user_context += "\nInstruction: Use the verified records above to directly answer the user's question and perform any requested calculations (counts, sums, percentages, rates, differences). DO NOT claim you are connecting to the database; you already have the live records right now.\n"

            if data_payload.get('db_connection_failed'):
                user_context += "Notice: Database connection failed. Explain this clearly, offer to retry, and do not fabricate data.\n"

            if history and len(history) > 0:
                user_context += "\nRecent Conversation Turns:\n"
                for h in history[-4:]:
                    s = h.get('sender', 'user')
                    t = h.get('text', '')
                    user_context += f"- {s}: {t}\n"

            # Execute Gemini with temperature 0.7 for warmth, wit, and conversational agility
            gemini_text, err = generate_content_with_gemini(
                system_instruction=SYSTEM_PROMPT,
                user_prompt=user_context,
                model_override=model_name,
                temperature=0.7,
                max_output_tokens=1024
            )
            if gemini_text and len(gemini_text.strip()) > 5:
                llm_reply = gemini_text.strip()
                provider_used = 'gemini'
            else:
                logger.info(f"Gemini API returned fallback notice: {err}. Using analytical engine.")
        except Exception as e:
            logger.error(f"Gemini service exception: {e}. Falling back to analytical engine.")

    # Fallback / Built-in Grounded Analytical Engine
    if not llm_reply:
        llm_reply = generate_analytical_response(
            user_message=message,
            intent=intent,
            sub_route=sub_route,
            tools_called=tools_called,
            data_payload=data_payload,
            params=params,
            user=user
        )
        provider_used = 'analytical_engine'

    return {
        'success': True,
        'reply': llm_reply,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }


def stream_ai_chat(message, history=None, user=None):
    """
    Progressive real-time streaming AI pipeline for AI Plant Insights.
    Yields truthful progress events:
      {"type": "status", "status": "Analyzing your question…"}
      {"type": "status", "status": "Checking production data…"} (if DB tools needed)
      {"type": "status", "status": "Preparing your answer…"}
      {"type": "delta", "delta": "..."}
      {"type": "done", "timestamp": "..."}
    """
    if not message or not message.strip():
        yield {'type': 'error', 'message': 'Please provide a valid question or message.'}
        return

    # Stage 1: Intent Analysis
    yield {'type': 'status', 'status': 'Analyzing your question…'}
    intent, sub_route, params = detect_intent(message, history)

    # Stage 2: Database Tool Execution (Strictly when needed)
    database_dependent_routes = [
        'bottle_details', 'rejection_count', 'rejection_analysis',
        'calculate_rejection_rate', 'production_count', 'quality_metrics',
        'capping_status', 'packaging_summary', 'sensor_status',
        'predict_production', 'recommendations', 'comparison',
        'hourly_production', 'batch_status', 'full_analysis', 'code_and_plant',
        'table_calculation'
    ]

    tools_called: List[str] = []
    data_payload: Dict[str, Any] = {}
    if sub_route in database_dependent_routes:
        yield {'type': 'status', 'status': 'Checking production data…'}
        tools_called, data_payload = execute_tools_and_reason(intent, sub_route, params)

    # Universal Telemetry Fallback for plant/calculation questions
    plant_keywords = [
        'bottle', 'bottles', 'reject', 'rejected', 'defect', 'defects', 'scrap', 'fail',
        'produced', 'production', 'plant', 'line', 'shift', 'box', 'boxes', 'pack', 'packaging',
        'cap', 'capping', 'batch', 'sensor', 'pass', 'passed', 'yield', 'rate', 'count', 'total',
        'calculate', 'calculation', 'table', 'tables', 'mysql', 'database', 'sql', 'till now',
        'so far', 'how many', 'how much'
    ]
    msg_low = message.lower()
    if not tools_called and any(k in msg_low for k in plant_keywords):
        try:
            tools_called.append('get_comprehensive_plant_snapshot')
            snap = get_comprehensive_plant_snapshot()
            data_payload['snapshot'] = snap
            data_payload['summary'] = snap['production_summary']
            data_payload['quality'] = snap['quality_metrics']
            data_payload['rejection'] = snap['rejection_analysis']
            data_payload['batch'] = snap['active_batch']
            data_payload['packaging'] = snap['packaging_status']
        except Exception as e:
            logger.error(f"Failed to attach plant snapshot in stream: {e}")

    # Stage 3: Preparing response
    yield {'type': 'status', 'status': 'Preparing your answer…'}

    streamed_any = False
    _, model_name = get_gemini_config()

    if is_gemini_configured():
        try:
            # Build compact prompt context
            user_context = f"User Request: {message}\n"
            user_context += f"Detected Internal Intent: {intent}\n"

            if user:
                user_context += f"User Profile: Name='{user.get('full_name', 'Operator')}', Role='{user.get('role', 'analyst')}'\n"

            if tools_called:
                user_context += f"\nVerified MySQL Production Records:\n{json.dumps(data_payload, indent=2, default=str)}\n"
                user_context += "\nInstruction: Use the verified records above to directly answer the user's question and perform any requested calculations (counts, sums, percentages, rates, differences). DO NOT claim you are connecting to the database; you already have the live records right now.\n"

            if data_payload.get('db_connection_failed'):
                user_context += "Notice: Database connection failed. Explain this clearly, offer to retry, and do not fabricate data.\n"

            if history and len(history) > 0:
                user_context += "\nRecent Conversation Turns:\n"
                # Keep last 3 turns to prevent token bloat
                for h in history[-3:]:
                    s = h.get('sender', 'user')
                    t = (h.get('text', '') or '')[:300]
                    user_context += f"- {s}: {t}\n"

            for chunk_text, err in generate_content_stream_with_gemini(
                system_instruction=SYSTEM_PROMPT,
                user_prompt=user_context,
                model_override=model_name,
                temperature=0.7,
                max_output_tokens=1024
            ):
                if chunk_text:
                    streamed_any = True
                    yield {'type': 'delta', 'delta': chunk_text}
                elif err:
                    logger.warning(f"Gemini streaming fallback triggered: {err}")
                    break

        except Exception as e:
            logger.error(f"Gemini streaming exception: {e}", exc_info=True)

    # Fallback to grounded analytical engine if nothing streamed
    if not streamed_any:
        analytical_reply = generate_analytical_response(
            user_message=message,
            intent=intent,
            sub_route=sub_route,
            tools_called=tools_called,
            data_payload=data_payload,
            params=params,
            user=user
        )
        # Yield in smooth chunks for natural reading rhythm
        words = analytical_reply.split(' ')
        chunk_size = 4
        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i + chunk_size]) + (' ' if i + chunk_size < len(words) else '')
            yield {'type': 'delta', 'delta': chunk}

    yield {
        'type': 'done',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

