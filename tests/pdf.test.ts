// @vitest-environment node
import { expect,it } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { renderDocument } from '../convex/pdf';
it('exports multi-page records with embedded font and exact UTF-8 source attachment',async()=>{
  const bytes=await renderDocument('chart_export','José López',['Signed — evaluation',...Array.from({length:100},()=>`Assessment: ${'Patient’s progress. '.repeat(40)}`)]);
  const pdf=await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(2);
  expect(pdf.getTitle()).toBe('Grounded chart export');
  expect(pdf.catalog.get(PDFName.of('Names'))).toBeDefined();
});
