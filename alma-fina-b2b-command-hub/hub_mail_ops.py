#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import imaplib
import json
import re
import smtplib
from datetime import datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, make_msgid, parsedate_to_datetime
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent.parent
DATA_DIR = ROOT / 'data'
DEFAULT_QUEUE = DATA_DIR / 'outreach-queue.csv'
DEFAULT_INBOX_EVENTS = DATA_DIR / 'inbox-events.json'
DEFAULT_SYNC_STATE = DATA_DIR / 'inbox-sync-state.json'
DEFAULT_CONFIG_CANDIDATES = [
    WORKSPACE / 'config' / 'email_bot.config.json',
    ROOT / 'config' / 'email_bot.config.json',
]
LOCAL_HTML_TEMPLATE_BY_LANGUAGE = {
    'English': ROOT / 'email-templates' / 'alma-fina-b2b-email-safe-v4-en.html',
    'Spanish': ROOT / 'email-templates' / 'alma-fina-b2b-email-safe-v4-es.html',
    'French': ROOT / 'email-templates' / 'alma-fina-b2b-email-safe-v4-fr.html',
}
LOCAL_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE = {
    'English': ROOT / 'email-templates' / 'alma-fina-b2b-email-safe-ultra-short-en.html',
    'Spanish': ROOT / 'email-templates' / 'alma-fina-b2b-email-safe-ultra-short-es.html',
    'French': ROOT / 'email-templates' / 'alma-fina-b2b-email-safe-ultra-short-fr.html',
}
WORKSPACE_HTML_TEMPLATE_BY_LANGUAGE = {
    'English': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-v4-en-2026-04-29.html',
    'Spanish': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-v4-es-2026-04-29.html',
    'French': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-v4-fr-2026-04-29.html',
    'Portuguese': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-whatsapp-final-pt-2026-04-28.html',
}
WORKSPACE_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE = {
    'English': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-ultra-short-en-2026-04-29.html',
    'Spanish': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-ultra-short-es-2026-04-29.html',
    'French': WORKSPACE / 'outreach' / 'email-html' / 'alma-fina-b2b-email-safe-ultra-short-fr-2026-04-29.html',
}
SALUTATION_PLACEHOLDER_BY_LANGUAGE = {
    'English': 'Hello [Name],',
    'Spanish': 'Hola [Nombre],',
    'French': 'Bonjour [Nom],',
    'Portuguese': 'Olá [Nome],',
}
GENERIC_SALUTATION_BY_LANGUAGE = {
    'English': 'Hello,',
    'Spanish': 'Hola,',
    'French': 'Bonjour,',
    'Portuguese': 'Olá,',
}
GREETING_BY_LANGUAGE = {
    'English': 'Hello',
    'Spanish': 'Hola',
    'French': 'Bonjour',
    'Portuguese': 'Olá',
}
SIGNOFF_BY_LANGUAGE = {
    'English': 'Best regards,\nMathieu Delorme',
    'Spanish': 'Saludos cordiales,\nMathieu Delorme',
    'French': 'Bien cordialement,\nMathieu Delorme',
    'Portuguese': 'Atenciosamente,\nMathieu Delorme',
}
TEXT_FALLBACK_BY_LANGUAGE = {
    'English': (
        'I am reaching out to introduce ALMA FINA and explore whether our Brussels sprout powder could be relevant '
        'for your ingredient sourcing, product development, or distribution activity.\n\n'
        'If relevant, we can share an analytical data sheet and discuss an evaluation sample under a potential non-binding commercial discussion.'
    ),
    'Spanish': (
        'Le escribo para presentar ALMA FINA y explorar si nuestro polvo de coles de Bruselas podría ser relevante '
        'para su actividad de abastecimiento de ingredientes, desarrollo de producto o distribución.\n\n'
        'Si resulta relevante, podemos compartir una ficha analítica y conversar sobre una muestra para evaluación dentro de una posible conversación comercial no vinculante.'
    ),
    'French': (
        'Je vous contacte pour vous présenter ALMA FINA et voir si notre poudre de choux de Bruxelles pourrait être pertinente '
        'pour votre activité d\'approvisionnement en ingrédients, de développement produit ou de distribution.\n\n'
        'Si cela est pertinent, nous pouvons partager une fiche analytique et échanger sur un échantillon d\'évaluation dans le cadre d\'une discussion commerciale potentielle et non engageante.'
    ),
    'Portuguese': (
        'Escrevo para apresentar a ALMA FINA e verificar se o nosso pó de couve-de-bruxelas pode ser relevante '
        'para sourcing de ingredientes, desenvolvimento de produto ou distribuição.\n\n'
        'Se fizer sentido, podemos compartilhar ficha analítica e conversar sobre uma amostra de avaliação em uma discussão comercial potencial e não vinculante.'
    ),
}

GENERIC_CONTACT_MARKERS = ['office', 'general', 'entry point', 'contact', 'regional office', 'main office', 'corporate office']
EMAIL_RE = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.I)
TAG_RE = re.compile(r'<[^>]+>')
WS_RE = re.compile(r'\s+')
BLOCK_LIVE_SEND_EVENT_TYPES = {'unsubscribe', 'no_fit', 'wrong_contact', 'bounce'}
PUBLIC_EMAIL_DOMAINS = {
    'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com',
    'protonmail.com', 'pm.me', 'mail.com'
}


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def read_csv(path: Path) -> List[Dict[str, str]]:
    with path.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: List[Dict[str, str]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    for row in rows[1:]:
        for key in row.keys():
            if key not in fieldnames:
                fieldnames.append(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def is_generic_contact(name: str) -> bool:
    normalized = WS_RE.sub(' ', (name or '').strip()).lower()
    return not normalized or any(marker in normalized for marker in GENERIC_CONTACT_MARKERS)


def first_name(name: str) -> str:
    cleaned = WS_RE.sub(' ', (name or '').strip())
    return cleaned.split(' ')[0] if cleaned else ''


def parse_template_file(path: Path) -> Dict[str, Dict[str, str]]:
    text = path.read_text(encoding='utf-8')
    sections = re.split(r'^##\s+', text, flags=re.MULTILINE)
    parsed: Dict[str, Dict[str, str]] = {}
    for section in sections[1:]:
        lines = section.splitlines()
        title = lines[0].strip()
        body = '\n'.join(lines[1:])
        match = re.search(r'^### (Subject|Asunto|Assunto|Objet)\n(.+?)\n\n### (Message|Mensaje|Mensagem)\n', body, flags=re.MULTILINE | re.DOTALL)
        if not match:
            continue
        parsed[title] = {
            'subject': match.group(2).strip(),
            'message': body[match.end():].strip(),
        }
    return parsed


def resolve_template_path(relative_path: str) -> Path | None:
    candidates = [
        WORKSPACE / relative_path,
        ROOT / relative_path,
        Path.cwd() / relative_path,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def personalize_message(language: str, contact_name: str, message: str) -> str:
    greeting = GREETING_BY_LANGUAGE.get(language, GREETING_BY_LANGUAGE['English'])
    if not is_generic_contact(contact_name):
        greeting = f'{greeting} {first_name(contact_name)}'
    message = re.sub(r'^(Hello|Hola|Olá|Bonjour),', f'{greeting},', message)
    message = re.sub(r'\n\n(Best regards,|Saludos cordiales,|Atenciosamente,|Bien cordialement,)\n.*$', '', message, flags=re.DOTALL)
    signoff = SIGNOFF_BY_LANGUAGE.get(language, SIGNOFF_BY_LANGUAGE['English'])
    return message.strip() + '\n\n' + signoff


def render_plain_text(row: Dict[str, str]) -> str:
    template_path = resolve_template_path(row.get('outreach_template_file', ''))
    section = row.get('outreach_template_section', '')
    if template_path and section:
        parsed = parse_template_file(template_path)
        template = parsed.get(section)
        if template:
            return personalize_message(row.get('communication_language', 'English'), row.get('contact_name', ''), template['message'])
    language = row.get('communication_language', 'English')
    greeting = GENERIC_SALUTATION_BY_LANGUAGE.get(language, GENERIC_SALUTATION_BY_LANGUAGE['English'])
    if not is_generic_contact(row.get('contact_name', '')):
        greeting = f"{GREETING_BY_LANGUAGE.get(language, GREETING_BY_LANGUAGE['English'])} {first_name(row.get('contact_name', ''))},"
    body = TEXT_FALLBACK_BY_LANGUAGE.get(language, TEXT_FALLBACK_BY_LANGUAGE['English'])
    signoff = SIGNOFF_BY_LANGUAGE.get(language, SIGNOFF_BY_LANGUAGE['English'])
    return f"{greeting}\n\n{body}\n\n{signoff}"


def wants_ultra_short_template(row: Dict[str, str]) -> bool:
    markers = [
        row.get('outreach_template_key', ''),
        row.get('outreach_template_section', ''),
        row.get('notes', ''),
    ]
    combined = ' '.join(normalize_text(value).lower() for value in markers)
    return 'ultra-short' in combined or 'ultra short' in combined or 'ultrashort' in combined


def resolve_html_template(language: str, row: Dict[str, str] | None = None) -> Path | None:
    use_ultra_short = wants_ultra_short_template(row or {})
    mappings = (
        (LOCAL_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE, WORKSPACE_ULTRA_SHORT_HTML_TEMPLATE_BY_LANGUAGE)
        if use_ultra_short else
        (LOCAL_HTML_TEMPLATE_BY_LANGUAGE, WORKSPACE_HTML_TEMPLATE_BY_LANGUAGE)
    )
    for mapping in mappings:
        path = mapping.get(language) or mapping.get('English')
        if path and path.exists():
            return path
    return None


def render_html(row: Dict[str, str]) -> str | None:
    language = row.get('communication_language', 'English')
    template_path = resolve_html_template(language, row)
    if not template_path:
        return None
    html_text = template_path.read_text(encoding='utf-8')
    placeholder = SALUTATION_PLACEHOLDER_BY_LANGUAGE.get(language, SALUTATION_PLACEHOLDER_BY_LANGUAGE['English'])
    if is_generic_contact(row.get('contact_name', '')):
        salutation = GENERIC_SALUTATION_BY_LANGUAGE.get(language, GENERIC_SALUTATION_BY_LANGUAGE['English'])
    else:
        salutation = f"{GREETING_BY_LANGUAGE.get(language, GREETING_BY_LANGUAGE['English'])} {first_name(row.get('contact_name', ''))},"
    return html_text.replace(placeholder, salutation)


def append_note(existing: str, note: str) -> str:
    base = (existing or '').strip()
    if not base:
        return note
    return f'{base} | {note}'


def domain_from_email(value: str) -> str:
    text = normalize_text(value).lower()
    if '@' not in text:
        return ''
    return text.rsplit('@', 1)[-1]


def normalize_message_id(value: str) -> str:
    return normalize_text(str(value or '').strip().strip('<>'))


def extract_message_ids(*values: str) -> List[str]:
    found: List[str] = []
    for value in values:
        text = str(value or '')
        for candidate in re.findall(r'<([^>]+)>', text):
            normalized = normalize_message_id(candidate)
            if normalized:
                found.append(normalized)
        if '<' not in text and '>' not in text:
            for token in re.split(r'[\s,]+', text):
                normalized = normalize_message_id(token)
                if normalized and '@' in normalized:
                    found.append(normalized)
    deduped: List[str] = []
    seen = set()
    for value in found:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


def latest_event_for_row(row: Dict[str, str], events: List[Dict[str, str]]) -> Dict[str, str] | None:
    queue_id = normalize_text(row.get('queue_id', ''))
    send_target = normalize_text(row.get('send_target', '')).lower()
    company = normalize_text(row.get('company', '')).lower()
    for event in events:
        event_contact_email = normalize_text(event.get('contact_email', '')).lower()
        if queue_id and normalize_text(event.get('queue_id', '')) == queue_id and (
            not send_target or not event_contact_email or event_contact_email == send_target
        ):
            return event
        if send_target and event_contact_email == send_target:
            return event
        if company and normalize_text(event.get('company', '')).lower() == company and (
            not send_target or not event_contact_email or event_contact_email == send_target
        ):
            return event
    return None


def block_reason_for_event(event: Dict[str, str] | None) -> str | None:
    if not event:
        return None
    event_type = normalize_text(event.get('event_type', '')).lower()
    if event_type == 'unsubscribe':
        return 'latest_event_unsubscribe'
    if event_type == 'no_fit':
        return 'latest_event_no_fit'
    if event_type == 'wrong_contact':
        return 'latest_event_wrong_contact'
    if event_type == 'bounce':
        return 'latest_event_bounce'
    return None


def apply_queue_guardrail_from_event(row: Dict[str, str], event: Dict[str, str]) -> None:
    event_type = normalize_text(event.get('event_type', '')).lower()
    occurred_at = event.get('occurred_at') or now_utc()
    row['last_inbox_event_type'] = event_type
    row['last_inbox_event_at_utc'] = occurred_at
    if event_type in {'unsubscribe', 'no_fit'}:
        row['do_not_contact'] = 'true'
    elif not row.get('do_not_contact'):
        row['do_not_contact'] = 'false'
    if event_type not in BLOCK_LIVE_SEND_EVENT_TYPES:
        if row.get('do_not_contact') != 'true':
            row['blocked_reason'] = ''
        return
    note = f'guardrail {event_type} logged {occurred_at}'
    row['requires_manual_approval'] = 'true'
    row['blocked_reason'] = event_type
    if note not in str(row.get('notes', '')):
        row['notes'] = append_note(row.get('notes', ''), note)


def resolve_config(config_path: Path | None) -> Dict[str, object]:
    loaded = {}
    chosen_path = None
    if config_path and config_path.exists():
        chosen_path = config_path
    else:
        for candidate in DEFAULT_CONFIG_CANDIDATES:
            if candidate.exists():
                chosen_path = candidate
                break
    if chosen_path:
        loaded = json.loads(chosen_path.read_text(encoding='utf-8'))

    smtp_cfg = dict(loaded.get('smtp') or {})
    from_email = loaded.get('from_email') or smtp_cfg.get('username') or ''
    from_name = loaded.get('from_name') or 'ALMA FINA'
    reply_to = loaded.get('reply_to') or from_email

    smtp_host = str((smtp_cfg.get('host') or '')).strip() or os_get('ALMAFINA_SMTP_HOST') or os_get('SMTP_HOST') or 'smtp.gmail.com'
    smtp_port = int(smtp_cfg.get('port') or os_get('ALMAFINA_SMTP_PORT') or os_get('SMTP_PORT') or 587)
    smtp_username = str((smtp_cfg.get('username') or '')).strip() or os_get('ALMAFINA_SMTP_USERNAME') or os_get('SMTP_USERNAME') or from_email
    smtp_password = str((smtp_cfg.get('password') or '')).strip() or os_get('ALMAFINA_SMTP_PASSWORD') or os_get('SMTP_PASSWORD') or ''
    smtp_use_tls = bool(smtp_cfg.get('use_tls', True))
    if os_get('ALMAFINA_SMTP_USE_TLS'):
        smtp_use_tls = os_get('ALMAFINA_SMTP_USE_TLS').lower() not in {'0', 'false', 'no'}

    from_email = os_get('ALMAFINA_FROM_EMAIL') or os_get('FROM_EMAIL') or from_email or smtp_username
    from_name = os_get('ALMAFINA_FROM_NAME') or os_get('FROM_NAME') or from_name
    reply_to = os_get('ALMAFINA_REPLY_TO') or os_get('REPLY_TO') or reply_to or from_email

    imap_host = os_get('ALMAFINA_IMAP_HOST') or 'imap.gmail.com'
    imap_port = int(os_get('ALMAFINA_IMAP_PORT') or 993)
    imap_username = os_get('ALMAFINA_IMAP_USERNAME') or smtp_username or from_email
    imap_password = os_get('ALMAFINA_IMAP_PASSWORD') or smtp_password
    imap_mailbox = os_get('ALMAFINA_IMAP_MAILBOX') or 'INBOX'

    return {
        'from_email': from_email,
        'from_name': from_name,
        'reply_to': reply_to,
        'smtp': {
            'host': smtp_host,
            'port': smtp_port,
            'username': smtp_username,
            'password': smtp_password,
            'use_tls': smtp_use_tls,
        },
        'imap': {
            'host': imap_host,
            'port': imap_port,
            'username': imap_username,
            'password': imap_password,
            'mailbox': imap_mailbox,
        },
        'config_path': str(chosen_path) if chosen_path else None,
    }


def os_get(name: str) -> str:
    import os
    return os.environ.get(name, '').strip()


def find_row(rows: List[Dict[str, str]], queue_id: str) -> Dict[str, str]:
    for row in rows:
        if row.get('queue_id') == queue_id:
            return row
    raise ValueError(f'queue_id_not_found:{queue_id}')


def approve_row(queue_path: Path, queue_id: str) -> dict:
    rows = read_csv(queue_path)
    row = find_row(rows, queue_id)
    row['requires_manual_approval'] = 'false'
    if row.get('send_status') in {'', 'draft_not_sent'}:
        row['send_status'] = 'approved'
    row['last_result'] = row.get('last_result') or 'approved in hub'
    write_csv(queue_path, rows)
    return {
        'ok': True,
        'action': 'approve',
        'queue_id': queue_id,
        'send_status': row.get('send_status', ''),
        'requires_manual_approval': row.get('requires_manual_approval', ''),
    }


def smtp_send(config: dict, to_email: str, subject: str, plain_body: str, html_body: str | None) -> str:
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{config['from_name']} <{config['from_email']}>"
    msg['To'] = to_email
    msg['Reply-To'] = config['reply_to']
    msg['Message-ID'] = make_msgid(domain=domain_from_email(config['from_email']) or None)
    msg.set_content(plain_body)
    if html_body:
        msg.add_alternative(html_body, subtype='html')

    smtp_cfg = config['smtp']
    with smtplib.SMTP(smtp_cfg['host'], int(smtp_cfg['port']), timeout=30) as smtp:
        if smtp_cfg.get('use_tls', True):
            smtp.starttls()
        smtp.login(smtp_cfg['username'], smtp_cfg['password'])
        smtp.send_message(msg)
    return json.dumps({
        'result': f'sent via smtp to {to_email}',
        'message_id': normalize_message_id(msg['Message-ID'])
    }, ensure_ascii=False)


def send_row(queue_path: Path, queue_id: str, mode: str, config_path: Path | None, test_to: str | None = None, inbox_events_path: Path = DEFAULT_INBOX_EVENTS) -> dict:
    rows = read_csv(queue_path)
    row = find_row(rows, queue_id)
    inbox_store = read_inbox_store(inbox_events_path)
    latest_event = latest_event_for_row(row, list(inbox_store.get('events', [])))
    config = resolve_config(config_path)
    subject = row.get('outreach_subject') or 'ALMA FINA ingredient introduction'
    plain_body = render_plain_text(row)
    html_body = render_html(row)

    if mode == 'test':
        target = (test_to or config['from_email']).strip()
        if not target:
            raise ValueError('missing_test_target')
        send_meta = json.loads(smtp_send(config, target, f"[TEST] {subject}", plain_body, html_body))
        stamp = now_utc()
        row['notes'] = append_note(row.get('notes', ''), f'test preview sent {stamp} to {target}')
        write_csv(queue_path, rows)
        return {
            'ok': True,
            'action': 'send_test',
            'queue_id': queue_id,
            'to': target,
            'result': send_meta['result'],
            'message_id': send_meta['message_id'],
            'sent_at_utc': stamp,
        }

    if str(row.get('requires_manual_approval', '')).lower() == 'true':
        raise ValueError('queue_row_requires_manual_approval')

    block_reason = block_reason_for_event(latest_event)
    if block_reason:
        raise ValueError(block_reason)

    row['attempt_count'] = str(int(row.get('attempt_count') or '0') + 1)
    row['last_attempt_at_utc'] = now_utc()
    try:
        send_meta = json.loads(smtp_send(config, row['send_target'], subject, plain_body, html_body))
        row['send_status'] = 'sent'
        row['last_result'] = send_meta['result']
        row['last_outbound_message_id'] = send_meta['message_id']
        write_csv(queue_path, rows)
        return {
            'ok': True,
            'action': 'send_live',
            'queue_id': queue_id,
            'to': row['send_target'],
            'result': send_meta['result'],
            'message_id': send_meta['message_id'],
            'sent_at_utc': row['last_attempt_at_utc'],
        }
    except Exception as exc:
        row['send_status'] = 'send_failed'
        row['last_result'] = f'{type(exc).__name__}: {exc}'
        write_csv(queue_path, rows)
        raise


def normalize_text(value: str) -> str:
    return WS_RE.sub(' ', (value or '').strip())


def strip_html(raw_html: str) -> str:
    text = TAG_RE.sub(' ', raw_html or '')
    return html.unescape(normalize_text(text))


def message_text(msg) -> str:
    chunks: List[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            content_type = (part.get_content_type() or '').lower()
            disposition = (part.get_content_disposition() or '').lower()
            if disposition == 'attachment':
                continue
            try:
                content = part.get_content()
            except Exception:
                continue
            if not content:
                continue
            if content_type == 'text/plain':
                chunks.append(str(content))
            elif content_type == 'text/html' and not chunks:
                chunks.append(strip_html(str(content)))
    else:
        try:
            content = msg.get_content()
        except Exception:
            content = ''
        if (msg.get_content_type() or '').lower() == 'text/html':
            return strip_html(str(content))
        return normalize_text(str(content))
    return normalize_text('\n'.join(chunks))


def classify_event(from_email: str, subject: str, body: str, msg) -> str:
    subject_l = (subject or '').lower()
    body_l = (body or '').lower()
    from_l = (from_email or '').lower()
    auto_submitted = str(msg.get('Auto-Submitted', '')).lower()
    precedence = str(msg.get('Precedence', '')).lower()
    failed_recipient = ' '.join(filter(None, [
        str(msg.get('X-Failed-Recipients', '')),
        str(msg.get('Final-Recipient', '')),
        str(msg.get('Original-Recipient', '')),
        str(msg.get('Diagnostic-Code', '')),
        str(msg.get('Action', '')),
        str(msg.get('Status', '')),
    ])).lower()
    combined = ' '.join([subject_l, body_l, auto_submitted, precedence, failed_recipient])

    if any(token in from_l for token in ['mailer-daemon', 'postmaster']) or any(token in combined for token in [
        'delivery status notification', 'undeliverable', 'delivery failure', 'mail delivery subsystem', 'returned mail',
        'address not found', 'user unknown', 'recipient address rejected', 'mailbox unavailable', '550 5.1.1', '550-5.1.1',
        'no such user', 'does not exist', 'couldn\'t be found', 'failure notice'
    ]):
        return 'bounce'
    if any(token in combined for token in [
        'unsubscribe', 'opt out', 'opt-out', 'remove me', 'stop emailing', 'do not contact', 'désabonner', 'desabonner',
        'no me contacten', 'no me escriban', 'retirez-moi', 'remove our address', 'please stop', 'stop contacting', 'please unsubscribe'
    ]):
        return 'unsubscribe'
    if auto_submitted and auto_submitted != 'no' or any(token in subject_l for token in ['out of office', 'automatic reply', 'autoreply', 'auto reply', 'vacation', 'fuera de la oficina', 'absence', 'automatic response']):
        return 'auto_reply'
    if any(token in combined for token in ['wrong person', 'wrong contact', 'not the right person', 'better contact', 'no soy la persona', 'pas la bonne personne', 'mauvais contact', 'incorrect contact', 'not responsible for this']):
        return 'wrong_contact'
    if any(token in combined for token in ['sample', 'muestra', 'échantillon', 'amostra', 'sampling', 'send sample']):
        return 'sample_request'
    if any(token in combined for token in ['analytical', 'analysis', 'coa', 'coa/', 'certificate of analysis', 'lab data', 'data sheet', 'specification', 'spec sheet', 'ficha anal', 'fiche analy', 'analyse']):
        return 'analytical_sheet_request'
    if any(token in combined for token in ['not interested', 'no interest', 'no fit', 'not a fit', 'pas intéressé', 'pas interesse', 'sin interés', 'sem interesse', 'not relevant for us']):
        return 'no_fit'
    if any(token in combined for token in ['interested', 'sounds good', 'let\'s discuss', 'podría interesar', 'pourrait nous intéresser', 'interesa', 'intéressé', 'would like to review', 'please send details']):
        return 'interested'
    return 'reply'


def event_status_for_type(event_type: str) -> str:
    if event_type in {'unsubscribe', 'no_fit'}:
        return 'closed'
    if event_type == 'auto_reply':
        return 'planned'
    return 'open'


def next_action_for_type(event_type: str) -> Tuple[str, str]:
    mapping = {
        'reply': ('Review the reply and qualify the buyer.', 'Reply with the next qualification step.'),
        'interested': ('Move quickly with qualification details.', 'Send the next-step commercial and technical follow-up.'),
        'sample_request': ('Confirm sample feasibility and timing.', 'Prepare the sample path and shipping details.'),
        'analytical_sheet_request': ('Prepare analytical sheet / CoA follow-up.', 'Send the analytical data sheet.'),
        'wrong_contact': ('Find the correct buyer-side owner.', 'Reroute the account before sending again.'),
        'unsubscribe': ('Stop future outreach to this contact.', 'Mark do-not-contact.'),
        'bounce': ('Repair deliverability or replace the email.', 'Find a valid contact before retry.'),
        'auto_reply': ('Track return timing or locate an alternate contact.', 'Wait for reopen window or reroute.'),
        'no_fit': ('Close the live outreach loop for now.', 'Keep outside active send rotation.'),
    }
    return mapping.get(event_type, mapping['reply'])


def extract_addresses(*values: Iterable[str]) -> List[str]:
    found: List[str] = []
    for value in values:
        if not value:
            continue
        if isinstance(value, str):
            items = [value]
        else:
            items = list(value)
        for item in items:
            for _, addr in getaddresses([item]):
                if addr:
                    found.append(addr.lower())
            for addr in EMAIL_RE.findall(item):
                found.append(addr.lower())
    deduped = []
    seen = set()
    for addr in found:
        if addr not in seen:
            seen.add(addr)
            deduped.append(addr)
    return deduped


def parse_message_date(msg) -> str:
    try:
        date = parsedate_to_datetime(msg.get('Date'))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return date.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    except Exception:
        return now_utc()


def read_inbox_store(path: Path) -> dict:
    return load_json(path, {'updatedAt': None, 'events': []})


def read_sync_state(path: Path) -> dict:
    return load_json(path, {'lastSyncAt': None, 'processedMessageIds': [], 'processedUids': []})


def build_queue_email_index(rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    out = {}
    for row in rows:
        target = normalize_text(row.get('send_target', '')).lower()
        if target:
            out[target] = row
    return out


def build_queue_message_id_index(rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    out = {}
    for row in rows:
        message_id = normalize_message_id(row.get('last_outbound_message_id', ''))
        if message_id:
            out[message_id] = row
    return out


def build_queue_domain_index(rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    domain_map: Dict[str, List[Dict[str, str]]] = {}
    for row in rows:
        domain = domain_from_email(row.get('send_target', ''))
        if not domain or domain in PUBLIC_EMAIL_DOMAINS:
            continue
        domain_map.setdefault(domain, []).append(row)
    return {domain: matches[0] for domain, matches in domain_map.items() if len(matches) == 1}


def match_queue_row_for_message(
    from_addresses: List[str],
    candidate_addresses: List[str],
    reference_ids: List[str],
    email_index: Dict[str, Dict[str, str]],
    message_id_index: Dict[str, Dict[str, str]],
    domain_index: Dict[str, Dict[str, str]],
) -> Tuple[Dict[str, str] | None, str, str]:
    for reference_id in reference_ids:
        if reference_id in message_id_index:
            row = message_id_index[reference_id]
            return row, normalize_text(row.get('send_target', '')).lower(), 'thread'

    for candidate in candidate_addresses:
        if candidate in email_index:
            return email_index[candidate], candidate, 'address'

    candidate_domains = []
    for candidate in from_addresses + candidate_addresses:
        domain = domain_from_email(candidate)
        if domain and domain not in candidate_domains:
            candidate_domains.append(domain)
    for domain in candidate_domains:
        if domain in domain_index:
            row = domain_index[domain]
            matched_email = next((addr for addr in from_addresses + candidate_addresses if domain_from_email(addr) == domain), row.get('send_target', ''))
            return row, matched_email, 'domain'
    return None, '', ''


def sync_queue_rows_from_events(queue_rows: List[Dict[str, str]], new_events: List[Dict[str, str]]) -> None:
    sorted_events = sorted(new_events, key=lambda item: str(item.get('occurred_at', '')), reverse=True)
    for row in queue_rows:
        row['last_inbox_event_type'] = ''
        row['last_inbox_event_at_utc'] = ''
        row['blocked_reason'] = ''
        if str(row.get('do_not_contact', '')).lower() != 'true':
            row['do_not_contact'] = 'false'
        latest = latest_event_for_row(row, sorted_events)
        if latest:
            apply_queue_guardrail_from_event(row, latest)


def apply_guardrails(queue_path: Path, inbox_events_path: Path) -> dict:
    queue_rows = read_csv(queue_path)
    store = read_inbox_store(inbox_events_path)
    sync_queue_rows_from_events(queue_rows, list(store.get('events', [])))
    write_csv(queue_path, queue_rows)
    return {
        'ok': True,
        'action': 'apply_guardrails',
        'queue_rows': len(queue_rows),
        'guardrail_rows': sum(1 for row in queue_rows if normalize_text(row.get('blocked_reason', ''))),
        'do_not_contact_rows': sum(1 for row in queue_rows if str(row.get('do_not_contact', '')).lower() == 'true'),
    }


def sync_inbox(queue_path: Path, inbox_events_path: Path, state_path: Path, config_path: Path | None, days: int) -> dict:
    config = resolve_config(config_path)
    imap_cfg = config['imap']
    if not imap_cfg['username'] or not imap_cfg['password']:
        raise ValueError('missing_imap_credentials')

    queue_rows = read_csv(queue_path)
    email_index = build_queue_email_index(queue_rows)
    message_id_index = build_queue_message_id_index(queue_rows)
    domain_index = build_queue_domain_index(queue_rows)
    store = read_inbox_store(inbox_events_path)
    state = read_sync_state(state_path)
    existing_message_ids = {str(event.get('source_message_id', '')).strip() for event in store.get('events', []) if event.get('source_message_id')}
    processed_uids = {str(value) for value in state.get('processedUids', [])}

    since_dt = datetime.now(timezone.utc) - timedelta(days=max(1, days))
    if state.get('lastSyncAt'):
        try:
            last_sync = datetime.fromisoformat(str(state['lastSyncAt']).replace('Z', '+00:00'))
            since_dt = min(since_dt, last_sync - timedelta(days=1))
        except Exception:
            pass
    since_token = since_dt.strftime('%d-%b-%Y')

    mailbox = imaplib.IMAP4_SSL(imap_cfg['host'], int(imap_cfg['port']))
    mailbox.login(imap_cfg['username'], imap_cfg['password'])
    mailbox.select(imap_cfg.get('mailbox') or 'INBOX')
    status, data = mailbox.search(None, 'SINCE', since_token)
    if status != 'OK':
        raise RuntimeError('imap_search_failed')
    uids = [uid.decode('utf-8') for uid in (data[0] or b'').split()]
    uids = uids[-250:]

    new_events = []
    added = 0
    skipped_duplicates = 0
    skipped_unmatched = 0

    for uid in uids:
        if uid in processed_uids:
            continue
        status, payload = mailbox.fetch(uid, '(RFC822)')
        if status != 'OK' or not payload or not payload[0]:
            continue
        raw_bytes = payload[0][1]
        msg = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        message_id = normalize_text(str(msg.get('Message-ID', '')).strip('<>')) or f'uid:{uid}'
        if message_id in existing_message_ids:
            processed_uids.add(uid)
            skipped_duplicates += 1
            continue

        from_addresses = extract_addresses(msg.get('From', ''))
        subject = normalize_text(str(msg.get('Subject', '')))
        body = message_text(msg)
        reference_ids = extract_message_ids(msg.get('In-Reply-To', ''), msg.get('References', ''))
        candidate_addresses = extract_addresses(
            msg.get('From', ''),
            msg.get('Reply-To', ''),
            msg.get('Sender', ''),
            msg.get('To', ''),
            msg.get('Delivered-To', ''),
            msg.get('Return-Path', ''),
            msg.get('X-Failed-Recipients', ''),
            msg.get('Final-Recipient', ''),
            msg.get('Original-Recipient', ''),
            body,
        )

        matched_row, matched_email, matched_via = match_queue_row_for_message(
            from_addresses,
            candidate_addresses,
            reference_ids,
            email_index,
            message_id_index,
            domain_index,
        )
        if not matched_row:
            skipped_unmatched += 1
            processed_uids.add(uid)
            existing_message_ids.add(message_id)
            continue

        from_email = from_addresses[0] if from_addresses else matched_email
        event_type = classify_event(from_email, subject, body, msg)
        recommended_action, next_action = next_action_for_type(event_type)
        snippet = normalize_text(body)[:600]
        contact_email = matched_email or from_email
        if event_type != 'bounce' and from_email:
            contact_email = from_email
        event = {
            'id': f"INBOX-{uid}",
            'buyer_id': '',
            'queue_id': matched_row.get('queue_id', ''),
            'company': matched_row.get('company', ''),
            'contact_email': contact_email,
            'contact_name': matched_row.get('contact_name', ''),
            'event_type': event_type,
            'status': event_status_for_type(event_type),
            'channel': 'email',
            'owner': 'auto-intake',
            'subject': subject,
            'snippet': snippet,
            'recommended_action': recommended_action,
            'next_action': next_action,
            'notes': f"Auto-ingested from {imap_cfg.get('mailbox') or 'INBOX'} as message {message_id}",
            'occurred_at': parse_message_date(msg),
            'logged_at': now_utc(),
            'source_message_id': message_id,
            'source_from_email': from_email,
            'source_in_reply_to': reference_ids[0] if reference_ids else '',
            'source_references': ' '.join(reference_ids),
            'matched_via': matched_via or 'address',
            'source_uid': uid,
        }
        new_events.append(event)
        existing_message_ids.add(message_id)
        processed_uids.add(uid)
        added += 1

    mailbox.close()
    mailbox.logout()

    merged_events = sorted(new_events + list(store.get('events', [])), key=lambda event: str(event.get('occurred_at', '')), reverse=True)
    sync_queue_rows_from_events(queue_rows, merged_events)
    write_csv(queue_path, queue_rows)
    write_json(inbox_events_path, {'updatedAt': now_utc(), 'events': merged_events})
    write_json(state_path, {
        'lastSyncAt': now_utc(),
        'processedMessageIds': sorted(existing_message_ids)[-500:],
        'processedUids': sorted(processed_uids, key=lambda value: int(re.sub(r'\D', '', value) or '0'))[-500:],
    })
    return {
        'ok': True,
        'action': 'sync_inbox',
        'added': added,
        'skipped_duplicates': skipped_duplicates,
        'skipped_unmatched': skipped_unmatched,
        'mailbox': imap_cfg.get('mailbox') or 'INBOX',
        'processed_uids': len(processed_uids),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Mail operations for Alma Fina hub')
    sub = parser.add_subparsers(dest='command', required=True)

    approve = sub.add_parser('approve')
    approve.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    approve.add_argument('--queue-id', required=True)

    send_test = sub.add_parser('send-test')
    send_test.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    send_test.add_argument('--queue-id', required=True)
    send_test.add_argument('--config', type=Path)
    send_test.add_argument('--to')

    send_live = sub.add_parser('send-live')
    send_live.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    send_live.add_argument('--queue-id', required=True)
    send_live.add_argument('--config', type=Path)
    send_live.add_argument('--inbox-events', type=Path, default=DEFAULT_INBOX_EVENTS)

    sync = sub.add_parser('sync-inbox')
    sync.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    sync.add_argument('--inbox-events', type=Path, default=DEFAULT_INBOX_EVENTS)
    sync.add_argument('--state', type=Path, default=DEFAULT_SYNC_STATE)
    sync.add_argument('--config', type=Path)
    sync.add_argument('--days', type=int, default=14)

    apply_guardrails_cmd = sub.add_parser('apply-guardrails')
    apply_guardrails_cmd.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    apply_guardrails_cmd.add_argument('--inbox-events', type=Path, default=DEFAULT_INBOX_EVENTS)

    args = parser.parse_args()
    try:
        if args.command == 'approve':
            payload = approve_row(args.queue, args.queue_id)
        elif args.command == 'send-test':
            payload = send_row(args.queue, args.queue_id, 'test', args.config, args.to)
        elif args.command == 'send-live':
            payload = send_row(args.queue, args.queue_id, 'live', args.config, inbox_events_path=args.inbox_events)
        elif args.command == 'apply-guardrails':
            payload = apply_guardrails(args.queue, args.inbox_events)
        else:
            payload = sync_inbox(args.queue, args.inbox_events, args.state, args.config, args.days)
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc), 'type': type(exc).__name__}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
