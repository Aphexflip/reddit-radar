import { describe, expect, it } from "vitest";
import { extractRecentFilings, filingDocumentUrl, normalizeCik } from "../src/sec";

describe("SEC adapter", () => {
  it("normalizes CIKs to the SEC 10-digit submissions format", () => {
    expect(normalizeCik("320193")).toBe("0000320193");
    expect(normalizeCik(1652044)).toBe("0001652044");
  });

  it("rejects malformed CIKs", () => {
    expect(() => normalizeCik("not-a-cik")).toThrow();
    expect(() => normalizeCik("12345678901")).toThrow();
  });

  it("extracts columnar recent filings without inventing direction", () => {
    const filings = extractRecentFilings({
      filings: {
        recent: {
          accessionNumber: ["0000320193-26-000001"],
          filingDate: ["2026-08-10"],
          reportDate: ["2026-08-09"],
          acceptanceDateTime: ["2026-08-10T14:05:12.0000"],
          form: ["8-K"],
          items: ["2.02,9.01"],
          primaryDocument: ["example8k.htm"],
          primaryDocDescription: ["Current report"],
          isXBRL: [1],
          isInlineXBRL: [1],
          size: [123456],
          fileNumber: ["001-00001"],
        },
      },
    });

    expect(filings).toHaveLength(1);
    expect(filings[0]?.form).toBe("8-K");
    expect(filings[0]?.items).toEqual(["2.02", "9.01"]);
    expect(filings[0]?.isXBRL).toBe(true);
  });

  it("constructs canonical SEC archive document URLs", () => {
    expect(
      filingDocumentUrl("0000320193", "0000320193-26-000001", "example8k.htm"),
    ).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/example8k.htm");
  });
});
