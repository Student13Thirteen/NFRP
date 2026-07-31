declare module 'pdf-parse/lib/pdf-parse.js' {
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  };

  type PdfParseOptions = {
    max?: number;
    pagerender?: (pageData: unknown) => Promise<string>;
    version?: string;
  };

  export default function pdfParse(dataBuffer: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;
}
