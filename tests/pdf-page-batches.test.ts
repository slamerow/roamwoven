import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  createPageNumberBatches,
  createPdfPageBatcher,
} from "@/lib/extraction/pdf-page-batches";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

export default async function run() {
  await test("PDFs split into complete ordered page batches", async () => {
    const document = await PDFDocument.create();
    for (let index = 0; index < 9; index += 1) document.addPage();
    const sourceBytes = await document.save();
    const batcher = await createPdfPageBatcher(sourceBytes);
    const planned = createPageNumberBatches({ batchSize: 4, pageCount: 9 });

    assert.equal(batcher.pageCount, 9);
    assert.deepEqual(planned, [[1, 2, 3, 4], [5, 6, 7, 8], [9]]);

    const batch = await batcher.createBatch(planned[1]);
    const parsedBatch = await PDFDocument.load(Buffer.from(batch.base64, "base64"));
    assert.deepEqual(batch.pageNumbers, [5, 6, 7, 8]);
    assert.equal(parsedBatch.getPageCount(), 4);
  });
}
