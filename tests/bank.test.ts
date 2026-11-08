import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BankIndex, Question } from '@shared/types';
import { DOMAINS } from '@shared/types';

const BANK = path.resolve(__dirname, '..', 'data', 'bank');
let index: BankIndex;

beforeAll(() => {
  index = JSON.parse(fs.readFileSync(path.join(BANK, 'index.json'), 'utf-8'));
});

describe('bank index', () => {
  it('contains every question from both PDFs', () => {
    expect(index.count).toBe(3770);
    expect(index.questions.length).toBe(3770);
    const math = index.questions.filter((q) => q.section === 'math');
    const rw = index.questions.filter((q) => q.section === 'rw');
    expect(math.length).toBe(1925); // SAT Questions.pdf
    expect(rw.length).toBe(1845); // SAT Questions (ENG).pdf
  });

  it('has unique ids and complete metadata', () => {
    const ids = new Set(index.questions.map((q) => q.id));
    expect(ids.size).toBe(index.questions.length);
    for (const q of index.questions) {
      expect(q.id).toMatch(/^[0-9a-f]{8}$/);
      expect(DOMAINS[q.section]).toContain(q.domain);
      expect(q.skill.length).toBeGreaterThan(0);
      expect(['E', 'M', 'H']).toContain(q.difficulty);
      expect(['mcq', 'spr']).toContain(q.type);
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.content).toBe(true);
    }
  });

  it('matches the PDF-derived index (ids, metadata, page order)', () => {
    const pdfMath = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'pdf_math.json'), 'utf-8'));
    const pdfRw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'pdf_rw.json'), 'utf-8'));
    const byId = new Map(index.questions.map((q) => [q.id, q]));
    const diff: Record<string, string> = { Easy: 'E', Medium: 'M', Hard: 'H' };
    for (const r of [...pdfMath, ...pdfRw]) {
      const q = byId.get(r.id)!;
      expect(q, r.id).toBeDefined();
      expect(q.domain).toBe(r.domain);
      expect(q.skill).toBe(r.skill);
      expect(q.difficulty).toBe(diff[r.difficulty]);
      expect(q.page).toBe(r.page);
    }
  });
});

describe('question content', () => {
  it('every question file loads and is well formed', () => {
    let mcq = 0, spr = 0;
    for (const e of index.questions) {
      const q: Question = JSON.parse(fs.readFileSync(path.join(BANK, 'q', e.id + '.json'), 'utf-8'));
      expect(q.id).toBe(e.id);
      expect(q.type).toBe(e.type);
      expect(q.stem.length + q.stimulus.length, e.id).toBeGreaterThan(0);
      expect(q.rationale.length, e.id).toBeGreaterThan(0);
      expect(q.stem + q.stimulus + q.rationale).not.toContain('<mfenced');
      if (q.type === 'mcq') {
        mcq++;
        expect(q.options?.length, e.id).toBe(4);
        expect(q.options!.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
        expect(q.correct?.length, e.id).toBe(1);
        expect(['A', 'B', 'C', 'D']).toContain(q.correct![0]);
        for (const o of q.options!) expect(o.html.length).toBeGreaterThan(0);
      } else {
        spr++;
        expect(e.section).toBe('math');
        expect(q.keys!.length, e.id).toBeGreaterThan(0);
        for (const k of q.keys!) expect(k, e.id).toMatch(/^-?(\d+\.?\d*|\.\d+)(\/\d+)?$/);
      }
    }
    expect(mcq).toBe(1461 + 1845);
    expect(spr).toBe(464);
  });
});
