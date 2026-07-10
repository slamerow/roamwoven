import { PDFDocument } from "pdf-lib";

export type PdfPageBatch = {
  base64: string;
  pageNumbers: number[];
};

export type PdfPageBatcher = {
  createBatch(pageNumbers: number[]): Promise<PdfPageBatch>;
  pageCount: number;
};

export async function createPdfPageBatcher(
  bytes: Uint8Array
): Promise<PdfPageBatcher> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const pageCount = source.getPageCount();

  return {
    pageCount,
    async createBatch(pageNumbers) {
      if (pageNumbers.length === 0) {
        throw new Error("OCR PDF page batch cannot be empty.");
      }

      const indexes = pageNumbers.map((pageNumber) => {
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
          throw new Error(
            `OCR PDF page ${pageNumber} is outside the document's 1-${pageCount} range.`
          );
        }

        return pageNumber - 1;
      });
      const batch = await PDFDocument.create();
      const copiedPages = await batch.copyPages(source, indexes);

      for (const page of copiedPages) {
        batch.addPage(page);
      }

      const batchBytes = await batch.save({ useObjectStreams: true });

      return {
        base64: Buffer.from(batchBytes).toString("base64"),
        pageNumbers: [...pageNumbers],
      };
    },
  };
}

export function createPageNumberBatches({
  batchSize,
  pageCount,
}: {
  batchSize: number;
  pageCount: number;
}) {
  const normalizedBatchSize = Math.max(1, Math.floor(batchSize));
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const batches: number[][] = [];

  for (let index = 0; index < pageNumbers.length; index += normalizedBatchSize) {
    batches.push(pageNumbers.slice(index, index + normalizedBatchSize));
  }

  return batches;
}
