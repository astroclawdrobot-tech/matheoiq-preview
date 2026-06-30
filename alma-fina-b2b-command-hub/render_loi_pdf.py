#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from textwrap import wrap

PAGE_W = 595
PAGE_H = 842
MARGIN_X = 54
TOP_Y = 790
LINE_GAP = 15
SECTION_GAP = 10


def pdf_escape(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def add_text_cmd(cmds: list[str], text: str, x: int, y: int, font: str = 'F1', size: int = 11):
    cmds.append(f"BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({pdf_escape(text)}) Tj ET")


def wrap_lines(text: str, width: int = 78) -> list[str]:
    text = ' '.join(str(text or '').split())
    return wrap(text, width=width) if text else ['']


def build_pages(d: dict) -> list[list[tuple[str, str]]]:
    seller_name = d.get('seller_name') or 'Mathieu Delorme'
    seller_email = d.get('seller_email') or 'underwatermanagement.mx@gmail.com'
    buyer_company = d.get('buyer_company') or '[Buyer]'
    buyer_address = d.get('buyer_address') or '[Buyer address]'
    buyer_contact = d.get('buyer_contact') or '[Buyer contact]'
    buyer_title = d.get('buyer_title') or '[Buyer title]'
    buyer_web = d.get('buyer_web') or '[Buyer website]'
    ref = d.get('ref') or 'AF-LOI-DRAFT'
    date = d.get('date') or '[Insert date]'
    qty_y1 = d.get('qty_y1') or '[Insert volume range]'
    price_fob = d.get('price_fob') or '[Insert price range and currency]'
    incoterms = d.get('incoterms') or '[Insert Incoterms]'
    payment = d.get('payment') or '[Insert payment terms]'
    exclusivity = d.get('exclusivity') or 'Non-exclusive discussion basis unless explicitly agreed otherwise in a later signed document.'
    harvest_date = d.get('harvest_date') or '[Insert expected harvest window]'
    sample_qty = d.get('sample_qty') or '[Insert sample quantity]'
    certifications = d.get('certifications') or '[Insert only verified certifications or validated product statements]'
    form = d.get('form') or '[Insert form / grind / particle size]'
    buyer_signatory = d.get('buyer_signatory') or '[Buyer signatory]'
    loi_signed = d.get('loi_signed') or '[Insert target window]'

    page1 = [
        ('title', 'ALMA FINA'),
        ('subtitle', f'Brussels Sprout Powder · Buyer-Safe LOI Draft · {buyer_company}'),
        ('meta', f'Date: {date}   |   Reference: {ref}   |   Domain: almafina.mx'),
        ('spacer', ''),
        ('section', '1. Parties'),
        ('label', 'Seller'),
        ('body', f'Alma Fina [full legal entity to confirm] · Tenancingo, Estado de Mexico, Mexico · Contact: {seller_name} [title to confirm] · {seller_email} · almafina.mx'),
        ('label', 'Buyer'),
        ('body', f'{buyer_company} · {buyer_address} · Contact: {buyer_contact} · {buyer_title} · {buyer_web}'),
        ('section', '2. Product Description'),
        ('label', 'Product'),
        ('body', 'Brussels Sprout Powder (Brassica oleracea var. gemmifera)'),
        ('label', 'Origin'),
        ('body', 'Tenancingo, Estado de Mexico, Mexico'),
        ('label', 'Expected harvest window'),
        ('body', harvest_date),
        ('label', 'Form'),
        ('body', f'{form}. Final technical specification to be confirmed in the corresponding product / analytical documentation.'),
        ('label', 'Quality documents'),
        ('body', 'Analytical data sheet, traceability details, and supporting quality information available on request and subject to confirmation.'),
        ('label', 'Claims / certifications'),
        ('body', certifications),
        ('section', '3. Indicative Commercial Terms'),
        ('label', 'Indicative quantity'),
        ('body', f'{qty_y1}, subject to technical and commercial review'),
        ('label', 'Indicative price'),
        ('body', f'{price_fob}. Subject to internal confirmation before final commercial paper.'),
        ('label', 'Incoterms'),
        ('body', incoterms),
        ('label', 'Payment terms'),
        ('body', payment),
    ]

    page2 = [
        ('title', 'ALMA FINA'),
        ('subtitle', f'Brussels Sprout Powder · Buyer-Safe LOI Draft · {buyer_company}'),
        ('section', '3. Indicative Commercial Terms (continued)'),
        ('label', 'Exclusivity'),
        ('body', exclusivity),
        ('label', 'Sample policy'),
        ('body', f'Evaluation sample target: {sample_qty}. Final shipment subject to availability, internal approval, and confirmed timeline.'),
        ('section', '4. Quality & Sampling'),
        ('body', 'Alma Fina expects to support buyer qualification with relevant analytical and commercial documentation as available. Any technical parameter, test method, or sample commitment should be confirmed in writing before reliance by the buyer.'),
        ('section', '5. Proposed Timeline'),
        ('body', f'Discussion draft shared: {loi_signed}'),
        ('body', 'Sample review: [Insert target window]'),
        ('body', 'Commercial evaluation: [Insert target window]'),
        ('body', 'Possible definitive agreement: [Insert target window]'),
        ('body', 'Supply timeline, if confirmed: subject to harvest and final agreement'),
        ('section', '6. Legal Position'),
        ('body', 'Non-binding discussion draft. This document is provided for commercial discussion purposes only and does not create a binding obligation on either party to conclude any transaction, purchase, sale, exclusivity arrangement, or definitive agreement.'),
        ('body', 'Any binding commercial, confidentiality, exclusivity, governing law, dispute resolution, compliance, delivery, or quality obligations should be stated expressly in a later signed agreement reviewed by the relevant parties.'),
        ('section', '7. Signature Block, For Draft Review'),
        ('label', 'Seller'),
        ('body', f'Name: {seller_name} · Title: [To confirm] · Date: {date}'),
        ('label', 'Buyer'),
        ('body', f'Name: {buyer_signatory} · Title: {buyer_title} · Date: [Insert date]'),
        ('spacer', ''),
        ('meta', f'Internal commercial use · almafina.mx · {ref}')
    ]
    return [page1, page2]


def page_stream(items: list[tuple[str, str]], page_num: int, total_pages: int) -> bytes:
    cmds: list[str] = []
    y = TOP_Y
    for kind, text in items:
        if kind == 'spacer':
            y -= SECTION_GAP
            continue
        if kind == 'title':
            add_text_cmd(cmds, text, MARGIN_X, y, font='F2', size=24)
            y -= 28
        elif kind == 'subtitle':
            add_text_cmd(cmds, text, MARGIN_X, y, font='F1', size=11)
            y -= 18
        elif kind == 'meta':
            add_text_cmd(cmds, text, MARGIN_X, y, font='F1', size=10)
            y -= 18
        elif kind == 'section':
            y -= 4
            add_text_cmd(cmds, text, MARGIN_X, y, font='F2', size=14)
            y -= 20
        elif kind == 'label':
            add_text_cmd(cmds, text, MARGIN_X, y, font='F2', size=11)
            y -= LINE_GAP
        elif kind == 'body':
            for line in wrap_lines(text):
                add_text_cmd(cmds, line, MARGIN_X + 8, y, font='F1', size=11)
                y -= LINE_GAP
        y -= 2
    footer = f'Alma Fina · Buyer-safe draft · Page {page_num}/{total_pages}'
    add_text_cmd(cmds, footer, MARGIN_X, 36, font='F1', size=9)
    return '\n'.join(cmds).encode('latin-1', errors='replace')


def build_pdf(payload: dict, out_path: Path):
    pages = build_pages(payload)
    objects: list[bytes] = []

    def add_object(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    font1 = add_object(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    font2 = add_object(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

    page_objs = []
    for i, items in enumerate(pages, start=1):
        stream = page_stream(items, i, len(pages))
        content = b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream'
        content_obj = add_object(content)
        page_dict = f'<< /Type /Page /Parent {{PAGES}} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 {font1} 0 R /F2 {font2} 0 R >> >> /Contents {content_obj} 0 R >>'.encode('latin-1')
        page_objs.append(add_object(page_dict))

    kids = ' '.join(f'{n} 0 R' for n in page_objs)
    pages_obj = add_object(f'<< /Type /Pages /Count {len(page_objs)} /Kids [{kids}] >>'.encode('latin-1'))
    for page_obj in page_objs:
        objects[page_obj - 1] = objects[page_obj - 1].replace(b'{PAGES}', str(pages_obj).encode('latin-1'))
    catalog_obj = add_object(f'<< /Type /Catalog /Pages {pages_obj} 0 R >>'.encode('latin-1'))

    pdf = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f'{i} 0 obj\n'.encode('latin-1'))
        pdf.extend(obj)
        pdf.extend(b'\nendobj\n')
    xref_pos = len(pdf)
    pdf.extend(f'xref\n0 {len(objects)+1}\n'.encode('latin-1'))
    pdf.extend(b'0000000000 65535 f \n')
    for off in offsets[1:]:
        pdf.extend(f'{off:010d} 00000 n \n'.encode('latin-1'))
    pdf.extend(f'trailer\n<< /Size {len(objects)+1} /Root {catalog_obj} 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n'.encode('latin-1'))
    out_path.write_bytes(pdf)


def main():
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('alma-fina-loi.pdf')
    payload = json.load(sys.stdin)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    build_pdf(payload, out_path)
    print(out_path)


if __name__ == '__main__':
    main()
