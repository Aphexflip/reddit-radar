import { ingestEvent } from "./engine";

export type SecEnv = Env & { SEC_USER_AGENT?: string };

export interface SecPollInput {
  ticker: string;
  cik: string | number;
  entity_name?: string;
  exchange?: string;
  max_filings?: number;
  forms?: string[];
}

interface SecRecentFilings {
  accessionNumber?: string[];
  filingDate?: string[];
  reportDate?: string[];
  acceptanceDateTime?: string[];
  act?: string[];
  form?: string[];
  fileNumber?: string[];
  filmNumber?: string[];
  items?: string[];
  size?: number[];
  isXBRL?: number[];
  isInlineXBRL?: number[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

interface SecSubmissionsResponse {
  cik?: string;
  entityType?: string;
  sic?: string;
  sicDescription?: string;
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  ein?: string;
  description?: string;
  category?: string;
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  stateOfIncorporationDescription?: string;
  filings?: {
    recent?: SecRecentFilings;
    files?: Array<{ name?: string; filingCount?: number; filingFrom?: string; filingTo?: string }>;
  };
}

export interface SecRecentFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  acceptanceDateTime: string | null;
  form: string;
  items: string[];
  primaryDocument: string | null;
  primaryDocDescription: string | null;
  isXBRL: boolean;
  isInlineXBRL: boolean;
  size: number | null;
  fileNumber: string | null;
  act: string | null;
}

export function normalizeCik(cik: string | number): string {
  const digits = String(cik).replace(/\D/g, "");
  if (!digits || digits.length > 10) throw new Error("CIK must contain 1 to 10 digits");
  return digits.padStart(10, "0");
}

function secArchiveCik(cik10: string): string {
  const trimmed = cik10.replace(/^0+/, "");
  return trimmed || "0";
}

export function filingDocumentUrl(cik10: string, accessionNumber: string, primaryDocument: string | null): string {
  const accessionCompact = accessionNumber.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${secArchiveCik(cik10)}/${accessionCompact}`;
  return primaryDocument ? `${base}/${encodeURIComponent(primaryDocument)}` : `${base}/`;
}

function at<T>(values: T[] | undefined, index: number): T | undefined {
  return values?.[index];
}

function splitItems(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractRecentFilings(payload: SecSubmissionsResponse): SecRecentFiling[] {
  const recent = payload.filings?.recent;
  const accessions = recent?.accessionNumber ?? [];
  const rows: SecRecentFiling[] = [];

  for (let index = 0; index < accessions.length; index += 1) {
    const accessionNumber = at(recent?.accessionNumber, index)?.trim();
    const filingDate = at(recent?.filingDate, index)?.trim();
    const form = at(recent?.form, index)?.trim();
    if (!accessionNumber || !filingDate || !form) continue;

    rows.push({
      accessionNumber,
      filingDate,
      reportDate: at(recent?.reportDate, index)?.trim() || null,
      acceptanceDateTime: at(recent?.acceptanceDateTime, index)?.trim() || null,
      form,
      items: splitItems(at(recent?.items, index)),
      primaryDocument: at(recent?.primaryDocument, index)?.trim() || null,
      primaryDocDescription: at(recent?.primaryDocDescription, index)?.trim() || null,
      isXBRL: at(recent?.isXBRL, index) === 1,
      isInlineXBRL: at(recent?.isInlineXBRL, index) === 1,
      size: at(recent?.size, index) ?? null,
      fileNumber: at(recent?.fileNumber, index)?.trim() || null,
      act: at(recent?.act, index)?.trim() || null,
    });
  }

  return rows;
}

function eventTimeFor(filing: SecRecentFiling): string {
  if (filing.acceptanceDateTime) {
    const normalized = filing.acceptanceDateTime.endsWith("Z")
      ? filing.acceptanceDateTime
      : `${filing.acceptanceDateTime}Z`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return `${filing.filingDate}T00:00:00.000Z`;
}

function formSignalType(form: string): string {
  return `sec_form_${form.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

async function alreadyIngested(env: Env, accessionNumber: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT id
    FROM raw_events
    WHERE source_id = 'source:sec-edgar' AND source_event_id = ?1
    LIMIT 1
  `).bind(accessionNumber).first<{ id: string }>();
  return Boolean(row?.id);
}

export async function pollSecSubmissions(env: SecEnv, input: SecPollInput) {
  if (!env.SEC_USER_AGENT?.trim()) {
    throw new Error(
      "SEC_USER_AGENT is required. Configure an identifying user-agent with organization/app name and a monitored contact address before polling SEC EDGAR.",
    );
  }

  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("ticker is required");
  const cik10 = normalizeCik(input.cik);
  const requestedLimit = input.max_filings ?? 10;
  const maxFilings = Math.max(1, Math.min(requestedLimit, 50));
  const allowedForms = input.forms?.length
    ? new Set(input.forms.map((form) => form.trim().toUpperCase()).filter(Boolean))
    : null;

  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": env.SEC_USER_AGENT,
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
  });

  if (response.status === 429) {
    throw new Error("SEC EDGAR rate limit reached; polling stopped without retrying in-request");
  }
  if (!response.ok) {
    throw new Error(`SEC submissions request failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as SecSubmissionsResponse;
  const filings = extractRecentFilings(payload)
    .filter((filing) => !allowedForms || allowedForms.has(filing.form.toUpperCase()))
    .slice(0, maxFilings);

  const results: Array<{
    accession_number: string;
    form: string;
    status: "ingested" | "duplicate";
    event_id?: string;
    canonical_url: string;
  }> = [];

  for (const filing of filings) {
    const canonicalUrl = filingDocumentUrl(cik10, filing.accessionNumber, filing.primaryDocument);
    if (await alreadyIngested(env, filing.accessionNumber)) {
      results.push({
        accession_number: filing.accessionNumber,
        form: filing.form,
        status: "duplicate",
        canonical_url: canonicalUrl,
      });
      continue;
    }

    const signals = [
      {
        signal_type: "sec_filing_detected",
        numeric_value: 1,
        normalized_value: 0,
        baseline_value: 0,
        unit: "event",
        direction_hint: "neutral" as const,
        confidence: 1,
        metadata: { form: filing.form },
      },
      {
        signal_type: formSignalType(filing.form),
        numeric_value: 1,
        normalized_value: 0,
        baseline_value: 0,
        unit: "event",
        direction_hint: "neutral" as const,
        confidence: 1,
        metadata: { form: filing.form, items: filing.items },
      },
    ];

    for (const item of filing.items) {
      signals.push({
        signal_type: `sec_item_${item.replace(/[^0-9a-zA-Z]+/g, "_").replace(/^_|_$/g, "")}`,
        numeric_value: 1,
        normalized_value: 0,
        baseline_value: 0,
        unit: "event",
        direction_hint: "neutral" as const,
        confidence: 1,
        metadata: { form: filing.form, item },
      });
    }

    const ingested = await ingestEvent(env, {
      source: {
        id: "source:sec-edgar",
        source_type: "regulatory_filing",
        name: "SEC EDGAR",
        provider: "sec.gov",
        reliability_prior: 1,
      },
      source_event_id: filing.accessionNumber,
      event_type: "sec_filing",
      event_time: eventTimeFor(filing),
      canonical_url: canonicalUrl,
      title: `${ticker} ${filing.form} filing`,
      summary: filing.primaryDocDescription || `${filing.form} filed with the U.S. Securities and Exchange Commission`,
      ticker,
      entity_name: input.entity_name || payload.name || ticker,
      exchange: input.exchange,
      signals,
      metadata: {
        cik: cik10,
        accession_number: filing.accessionNumber,
        filing_date: filing.filingDate,
        report_date: filing.reportDate,
        acceptance_datetime: filing.acceptanceDateTime,
        form: filing.form,
        items: filing.items,
        primary_document: filing.primaryDocument,
        primary_document_description: filing.primaryDocDescription,
        is_xbrl: filing.isXBRL,
        is_inline_xbrl: filing.isInlineXBRL,
        size_bytes: filing.size,
        file_number: filing.fileNumber,
        act: filing.act,
        sec_company_metadata: {
          sic: payload.sic,
          sic_description: payload.sicDescription,
          fiscal_year_end: payload.fiscalYearEnd,
          state_of_incorporation: payload.stateOfIncorporation,
        },
      },
    });

    results.push({
      accession_number: filing.accessionNumber,
      form: filing.form,
      status: "ingested",
      event_id: ingested.event_id,
      canonical_url: canonicalUrl,
    });
  }

  return {
    ticker,
    cik: cik10,
    company_name: payload.name ?? input.entity_name ?? ticker,
    checked: filings.length,
    ingested: results.filter((result) => result.status === "ingested").length,
    duplicates: results.filter((result) => result.status === "duplicate").length,
    source_url: url,
    results,
    note: "Filing detection and form/item presence are neutral evidence in v0.1; directional scoring requires parsed filing facts or independent signals.",
  };
}
